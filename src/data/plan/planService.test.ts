import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { planWeek } from '../../domain/planner/weekPlanner';
import { Database } from '../db/db';
import type { GymSession, HealthWorkout, UserProfile } from '../db/models';
import { DEFAULT_PROFILE } from '../db/repository';
import { applyProgression, createPlan, DEFAULT_AVAILABILITY, getCardioProgress, getWeekPlan, previousWeekLoads, type CardioProgress } from './planService';

const TZ = 'Europe/Madrid';
const at = (date: string, h = 18) => Date.parse(`${date}T${String(h).padStart(2, '0')}:00:00+02:00`);
const run = (date: string, durationMin: number, avgHR?: number): HealthWorkout => ({
  id: `${date}-r`,
  startMs: at(date),
  endMs: at(date) + durationMin * 60_000,
  kind: 'run',
  rawType: 'Carrera',
  durationMin,
  avgHR,
});

describe('previousWeekLoads', () => {
  it('sums Health workouts and gym sessions without a Health strength workout, oldest first', () => {
    const gym = [{ id: 'g', date: '2026-10-07', sets: [{ exerciseId: 'x', order: 0, weightKg: 50, reps: 10, skipped: false }], durationMin: 50 } as GymSession];
    const loads = previousWeekLoads('2026-10-12', [run('2026-10-06', 30)], gym, 179, TZ);
    expect(loads).toEqual([150 + 350]); // earlier empty weeks are not a "break"
  });
});

describe('applyProgression', () => {
  const base: CardioProgress = { fiveK: { phase: 2, weekInPhase: 1 }, swim: { phase: 1 }, appliedWeeks: [], log: [] };
  const plan = planWeek({
    weekStart: '2026-10-05',
    availability: DEFAULT_AVAILABILITY,
    maxGymDays: 3,
    threeDayTemplate: 'upperLowerFull',
    fiveK: base.fiveK,
    swim: base.swim,
    blockWeek: 1,
    previousWeekLoads: [],
    stepGoal: 10000,
    now: 0,
  });

  it('advances after both key runs at ≤ 6/10, using the Health HR, and only once per week', () => {
    for (const s of plan.sessions) {
      if (s.kind === 'run' && s.run?.slot !== 'C') Object.assign(s, { status: 'done', result: { effort: 5 } });
    }
    const workouts = plan.sessions.filter((s) => s.kind === 'run').map((s) => run(s.date, s.minutes, 140));
    const next = applyProgression(base, plan, workouts, 156, TZ);
    expect(next.fiveK).toEqual({ phase: 2, weekInPhase: 2 });
    expect(next.log.at(-1)?.text).toMatch(/superada/);
    expect(applyProgression(next, plan, workouts, 156, TZ)).toBe(next);
  });

  it('repeats the week when HR went above Z3', () => {
    const workouts = plan.sessions.filter((s) => s.kind === 'run').map((s) => run(s.date, s.minutes, 165));
    expect(applyProgression(base, plan, workouts, 156, TZ).fiveK).toEqual(base.fiveK);
  });
});

describe('createPlan', () => {
  it('stores the plan and the progress, starting the deload block', async () => {
    const db = await Database.open(new IDBFactory(), 'plan');
    const profile: UserProfile = { ...DEFAULT_PROFILE, hrMaxObserved: 179 };
    const { plan, progress } = await createPlan(db, { monday: '2026-10-12', availability: DEFAULT_AVAILABILITY, maxGymDays: 3 }, { profile, workouts: [], gymSessions: [], timeZone: TZ, z3Max: 156 });
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(progress.blockStart).toBe('2026-10-12');
    expect((await getWeekPlan(db, '2026-10-12'))?.sessions.length).toBe(plan.sessions.length);
    expect((await getCardioProgress(db))?.fiveK.phase).toBe(1); // no runs in Health → phase 1 suggestion
    expect((await db.getOutbox()).map((c) => c.store).sort()).toEqual(['kv', 'weekPlans']); // both synced

    const fourth = await createPlan(db, { monday: '2026-11-02', availability: DEFAULT_AVAILABILITY, maxGymDays: 3 }, { profile, workouts: [], gymSessions: [], timeZone: TZ, z3Max: 156 });
    expect(fourth.plan.deload).toBe(true);
  });
});
