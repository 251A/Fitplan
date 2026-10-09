// Glue between the pure planner and storage: plans, cardio progression, previous-week loads.

import { suggestFiveKPhase, nextFiveKState, type FiveKState, type RunResult } from '../../domain/cardioPlans/fiveKPlan';
import { estimateSwimPace, nextSwimState, type SwimState } from '../../domain/cardioPlans/swimPlan';
import { addDays, dateKey, type DateKey } from '../../domain/dates';
import { dailyLoads, sessionLoad } from '../../domain/load/trainingLoad';
import { planWeek, type DayAvailability, type PlannedSession, type WeekPlan } from '../../domain/planner/weekPlanner';
import { weekStart } from '../../domain/strength/strength';
import { STORES, type Database } from '../db/db';
import type { GymSession, HealthWorkout, UserProfile } from '../db/models';

export interface CardioProgress {
  fiveK: FiveKState;
  swim: SwimState;
  /** Monday of the first planned week; deloads every 4th week from here. */
  blockStart?: DateKey;
  /** Weeks whose results were already applied to the progression. */
  appliedWeeks: DateKey[];
  log: Array<{ weekStart: DateKey; text: string }>;
}

const KV_CARDIO = 'cardioProgress';

export const getCardioProgress = (db: Database) => db.getKV<CardioProgress>(KV_CARDIO);
export const saveCardioProgress = (db: Database, p: CardioProgress) =>
  db.writeSynced([{ store: 'kv', key: KV_CARDIO, value: p }]);

export const getWeekPlan = (db: Database, monday: DateKey) => db.get<WeekPlan>(STORES.weekPlans, monday);
export const getAllWeekPlans = (db: Database) => db.getAll<WeekPlan>(STORES.weekPlans);
export const saveWeekPlan = (db: Database, plan: WeekPlan) =>
  db.writeSynced([{ store: 'weekPlans', key: plan.weekStart, value: { ...plan, updatedAt: Date.now() } }]);
export const deleteWeekPlan = (db: Database, monday: DateKey) => db.writeSynced([{ store: 'weekPlans', key: monday, value: null }]);

/** Default availability: everything allowed every day. */
export const DEFAULT_AVAILABILITY: DayAvailability[] = Array.from({ length: 7 }, (_, i) => ({
  weekday: i + 1,
  allowed: ['gym', 'run', 'swim'],
}));

export function recentRunsAndSwims(workouts: ReadonlyArray<HealthWorkout>, today: DateKey, timeZone: string) {
  const from = addDays(today, -42);
  const recent = workouts.filter((w) => dateKey(w.startMs, timeZone) >= from);
  return { runs: recent.filter((w) => w.kind === 'run'), swims: recent.filter((w) => w.kind === 'swim') };
}

export function suggestedProgress(workouts: ReadonlyArray<HealthWorkout>, today: DateKey, timeZone: string): CardioProgress {
  const { runs } = recentRunsAndSwims(workouts, today, timeZone);
  return { fiveK: { phase: suggestFiveKPhase(runs), weekInPhase: 1 }, swim: { phase: 1 }, appliedWeeks: [], log: [] };
}

/** Actual weekly load of the `n` weeks before `monday`, oldest first. */
export function previousWeekLoads(
  monday: DateKey,
  workouts: ReadonlyArray<HealthWorkout>,
  gymSessions: ReadonlyArray<GymSession>,
  hrMax: number | undefined,
  timeZone: string,
  n = 4,
): number[] {
  const loads = dailyLoads(workouts, hrMax, timeZone);
  // Gym sessions logged in the app or imported from Symmetry that have no Health strength workout that day.
  const strengthDays = new Set(workouts.filter((w) => w.kind === 'strength').map((w) => dateKey(w.startMs, timeZone)));
  for (const s of gymSessions) {
    if (!s.date || strengthDays.has(s.date) || s.sets.length === 0) continue;
    loads.set(s.date, (loads.get(s.date) ?? 0) + sessionLoad({ startMs: 0, durationMin: s.durationMin ?? 60, kind: 'strength' }));
  }
  const out: number[] = [];
  for (let w = n; w >= 1; w--) {
    const start = addDays(monday, -7 * w);
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += loads.get(addDays(start, i)) ?? 0;
    out.push(sum);
  }
  // Leading empty weeks mean "no history yet", not "a break".
  while (out.length && out[0] === 0) out.shift();
  return out;
}

/** Fills average HR from the Health workout of the same day and kind, if the user didn't. */
export function withHealthHR(s: PlannedSession, workouts: ReadonlyArray<HealthWorkout>, timeZone: string): PlannedSession {
  if (s.result?.avgHR !== undefined || (s.kind !== 'run' && s.kind !== 'swim')) return s;
  const w = workouts.find((x) => x.kind === s.kind && dateKey(x.startMs, timeZone) === s.date && x.avgHR);
  return w ? { ...s, result: { ...s.result, avgHR: w.avgHR } } : s;
}

/** Applies last week's results to the 5K and swim progression (once per week). */
export function applyProgression(progress: CardioProgress, prev: WeekPlan | undefined, workouts: ReadonlyArray<HealthWorkout>, z3Max: number, timeZone: string): CardioProgress {
  if (!prev || progress.appliedWeeks.includes(prev.weekStart)) return progress;
  const sessions = prev.sessions.map((s) => withHealthHR(s, workouts, timeZone));
  const runs: RunResult[] = sessions
    .filter((s) => s.kind === 'run' && s.run)
    .map((s) => ({ slot: s.run!.slot, done: s.status === 'done', effort: s.result?.effort, avgHR: s.result?.avgHR }));
  const five = nextFiveKState(progress.fiveK, runs, z3Max);
  let swim = progress.swim;
  let swimText = '';
  const swimDone = sessions.find((s) => s.kind === 'swim' && s.status === 'done' && s.result?.noStops);
  if (swimDone) {
    const r = nextSwimState(progress.swim, true, swimDone.result?.avgHR, z3Max);
    swim = r.state;
    if (r.advanced) swimText = r.state.completed ? ' Natación: ¡500 m seguidos conseguidos!' : ` Natación: pasas a la fase ${r.state.phase}.`;
  }
  return {
    ...progress,
    fiveK: five.state,
    swim,
    appliedWeeks: [...progress.appliedWeeks, prev.weekStart].slice(-20),
    log: [...progress.log, { weekStart: prev.weekStart, text: `5K: ${five.reason}${swimText}` }].slice(-20),
  };
}

export interface PlanRequest {
  monday: DateKey;
  availability: DayAvailability[];
  maxGymDays: number;
  /** Mid-week planning: first day that can still be used. */
  availableFrom?: DateKey;
}

export async function createPlan(
  db: Database,
  req: PlanRequest,
  ctx: {
    profile: UserProfile;
    workouts: HealthWorkout[];
    gymSessions: GymSession[];
    timeZone: string;
    z3Max: number;
  },
): Promise<{ plan: WeekPlan; progress: CardioProgress }> {
  let progress = (await getCardioProgress(db)) ?? suggestedProgress(ctx.workouts, req.monday, ctx.timeZone);
  progress = applyProgression(progress, await getWeekPlan(db, addDays(req.monday, -7)), ctx.workouts, ctx.z3Max, ctx.timeZone);
  const blockStart = progress.blockStart ?? req.monday;
  const weeksSince = Math.max(0, Math.round((Date.parse(req.monday) - Date.parse(blockStart)) / (7 * 86_400_000)));
  const { swims } = recentRunsAndSwims(ctx.workouts, req.monday, ctx.timeZone);

  const plan = planWeek({
    weekStart: req.monday,
    availability: req.availability,
    maxGymDays: req.maxGymDays,
    threeDayTemplate: ctx.profile.threeDayTemplate,
    fiveK: progress.fiveK,
    swim: progress.swim,
    swimPacePer100: swims.length ? estimateSwimPace(swims) : undefined,
    blockWeek: (weeksSince % 4) + 1,
    previousWeekLoads: previousWeekLoads(req.monday, ctx.workouts, ctx.gymSessions, ctx.profile.hrMaxObserved || undefined, ctx.timeZone),
    stepGoal: ctx.profile.stepGoal || 10000,
    availableFrom: req.availableFrom,
  });
  progress = { ...progress, blockStart };
  await saveCardioProgress(db, progress);
  await saveWeekPlan(db, plan);
  return { plan, progress };
}

export const mondayOf = weekStart;
