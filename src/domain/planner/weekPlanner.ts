// Weekly planner (spec section 6). Deterministic: same input → same plan. Every decision leaves a
// readable rationale. Claude may later summarise the plan but never changes it.

import { easyThirdRun, fiveKWeek, type FiveKState, type Intensity, type RunPrescription } from '../cardioPlans/fiveKPlan';
import { swimSession, type SwimPrescription, type SwimState } from '../cardioPlans/swimPlan';
import { addDays, isoWeekday, type DateKey } from '../dates';
import { TEMPLATES, templatesForDays, trainsLegs, type GymTemplateName, type ThreeDayTemplate } from './gymTemplates';

export type Activity = 'gym' | 'run' | 'swim';
export type SessionKind = Activity | 'rest' | 'activeRecovery';
export type SessionStatus = 'planned' | 'done' | 'moved' | 'skipped' | 'downgraded';

export interface DayAvailability {
  weekday: number; // 1 = Monday … 7 = Sunday
  allowed: Activity[];
  maxMinutes?: number;
}

export interface SessionResult {
  effort?: number; // RPE 1–10
  avgHR?: number;
  /** Swims: completed without stopping outside the rests. */
  noStops?: boolean;
  doneAt?: number;
}

export interface PlannedSession {
  id: string;
  date: DateKey;
  kind: SessionKind;
  gymTemplate?: GymTemplateName;
  /** 1 = normal; 0.6 on deload weeks (−40 % sets). */
  setsFactor?: number;
  run?: RunPrescription;
  swim?: SwimPrescription;
  intensity: Intensity;
  minutes: number;
  load: number;
  /** Higher = more important (dropped last): swim 1 < easy run 2 < key runs 3 < upper gym 4 < legs 5. */
  priority: number;
  status: SessionStatus;
  rationale: string[];
  result?: SessionResult;
}

export interface WeekPlan {
  weekStart: DateKey;
  availability: DayAvailability[];
  maxGymDays: number;
  sessions: PlannedSession[];
  stepTargets: Record<DateKey, number>;
  warnings: string[];
  deload: boolean;
  fiveK: FiveKState;
  swimState: SwimState;
  createdAt: number;
  updatedAt: number;
  summaryText?: string;
}

export interface PlannerInput {
  weekStart: DateKey; // Monday
  availability: DayAvailability[];
  maxGymDays: number;
  threeDayTemplate: ThreeDayTemplate;
  fiveK: FiveKState;
  swim: SwimState;
  swimPacePer100?: number;
  /** 1–4 within the training block; week 4 is a deload. */
  blockWeek: number;
  /** Actual load of previous weeks, oldest first (up to 4). */
  previousWeekLoads: number[];
  stepGoal: number;
  /** Planning the current week mid-week: days before this date are not available. */
  availableFrom?: DateKey;
  now?: number;
}

const DAY_NAME = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const dayName = (d: DateKey) => DAY_NAME[isoWeekday(d)]!;

/** Planned load in the same units as domain/load (≈ zone × 2 or RPE per minute). */
export function plannedLoad(kind: Activity, intensity: Intensity, minutes: number): number {
  if (kind === 'gym') return 7 * minutes;
  const perMin = intensity === 'hard' ? 6 : intensity === 'moderate' ? 5 : 4;
  return perMin * minutes;
}

const gymPriority = (t: GymTemplateName) => (trainsLegs(t) ? 5 : 4);

interface Day {
  date: DateKey;
  avail: DayAvailability;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first!, ...c]), ...combinations(rest, k)];
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}

const dist = (a: DateKey, b: DateKey) => Math.abs(isoWeekday(a) - isoWeekday(b));

/** Picks gym days and their template order (spec 6 step 2). */
function placeGym(days: Day[], names: GymTemplateName[]): Array<{ date: DateKey; template: GymTemplateName }> {
  if (names.length === 0) return [];
  const capable = days.filter((d) => d.avail.allowed.includes('gym') && (d.avail.maxMinutes ?? 999) >= 40);
  let best: { score: number; plan: Array<{ date: DateKey; template: GymTemplateName }> } | undefined;
  const uniquePerms = [...new Map(permutations(names).map((p) => [p.join('|'), p])).values()];
  for (const subset of combinations(capable, names.length)) {
    const dates = subset.map((d) => d.date);
    const gaps = dates.slice(1).map((d, i) => dist(d, dates[i]!));
    const minGap = gaps.length ? Math.min(...gaps) : 7;
    const spread = gaps.reduce((a, g) => a + (g - 7 / names.length) ** 2, 0);
    for (const perm of uniquePerms) {
      let conflicts = 0;
      for (let i = 1; i < dates.length; i++) {
        if (dist(dates[i]!, dates[i - 1]!) === 1) {
          const shared = TEMPLATES[perm[i]!].groups.some((g) => TEMPLATES[perm[i - 1]!].groups.includes(g));
          if (shared) conflicts++;
        }
      }
      // A free run day not touching a leg day lets the week keep its one hard run.
      const legDates = dates.filter((_, i) => trainsLegs(perm[i]!));
      const hardRunSlot = days.some(
        (d) => !dates.includes(d.date) && d.avail.allowed.includes('run') && legDates.every((l) => dist(l, d.date) > 1),
      );
      const score = conflicts * 1000 - minGap * 50 + spread + (hardRunSlot ? 0 : 20);
      if (!best || score < best.score) best = { score, plan: dates.map((date, i) => ({ date, template: perm[i]! })) };
    }
  }
  return best?.plan ?? [];
}

export function planWeek(input: PlannerInput): WeekPlan {
  const now = input.now ?? Date.now();
  const days: Day[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(input.weekStart, i);
    const given = input.availability.find((a) => a.weekday === i + 1) ?? { weekday: i + 1, allowed: [] };
    const avail = input.availableFrom && date < input.availableFrom ? { ...given, allowed: [] } : given;
    return { date, avail };
  });
  const byDate = new Map(days.map((d) => [d.date, d]));
  const warnings: string[] = [];
  const sessions: PlannedSession[] = [];
  const deload = input.blockWeek % 4 === 0;
  const fits = (d: Day, minutes: number) => d.avail.maxMinutes === undefined || minutes <= d.avail.maxMinutes;

  // ---- Step 1 & 2: gym -----------------------------------------------------
  const gymCapable = days.filter((d) => d.avail.allowed.includes('gym') && (d.avail.maxMinutes ?? 999) >= 40).length;
  const gymDays = Math.min(input.maxGymDays, gymCapable);
  const names = templatesForDays(gymDays, input.threeDayTemplate);
  if (gymDays === 0) {
    warnings.push('Sin días de gimnasio esta semana: riesgo de perder músculo. Si puedes, haz 2 sesiones cortas de cuerpo completo (40 min).');
  } else if (gymDays === 1) {
    warnings.push('Solo 1 día de gimnasio: hará cuerpo completo, pero es poco para mantener músculo.');
  }
  if (gymDays < input.maxGymDays && gymCapable < input.maxGymDays) {
    warnings.push(`Querías ${input.maxGymDays} días de gimnasio pero solo hay ${gymCapable} días disponibles para ir.`);
  }

  for (const { date, template } of placeGym(days, names)) {
    const t = TEMPLATES[template];
    const d = byDate.get(date)!;
    const minutes = Math.min(t.minutes, d.avail.maxMinutes ?? t.minutes);
    const rationale = [`${template} el ${dayName(date)}: días de gimnasio lo más separados posible.`];
    if (minutes < t.minutes) rationale.push(`Versión corta: tienes ${minutes} min.`);
    if (deload) rationale.push('Semana de descarga: 40 % menos de series.');
    sessions.push({
      id: `${date}-gym`,
      date,
      kind: 'gym',
      gymTemplate: template,
      setsFactor: deload ? 0.6 : minutes < t.minutes ? Math.max(0.6, minutes / t.minutes) : 1,
      intensity: 'moderate',
      minutes,
      load: plannedLoad('gym', 'moderate', minutes) * (deload ? 0.6 : 1),
      priority: gymPriority(template),
      status: 'planned',
      rationale,
    });
  }

  // ---- Step 3: cardio ------------------------------------------------------
  const gymDates = new Set(sessions.map((s) => s.date));
  const legDates = sessions.filter((s) => s.gymTemplate && trainsLegs(s.gymTemplate)).map((s) => s.date);
  const free = days.filter((d) => !gymDates.has(d.date));
  const used = new Set<DateKey>();
  const cardioLimit = gymDays >= 5 ? 2 : 5;
  const allEasy = gymDays >= 5 || deload;
  let cardioCount = 0;

  const nextToLegs = (date: DateKey) => legDates.some((l) => dist(l, date) === 1);
  const runDates = () => sessions.filter((s) => s.kind === 'run').map((s) => s.date);

  function pick(activity: Activity, minutes: number, score: (d: Day) => number): Day | undefined {
    const candidates = free.filter((d) => !used.has(d.date) && d.avail.allowed.includes(activity) && fits(d, minutes));
    return candidates.sort((a, b) => score(b) - score(a) || a.date.localeCompare(b.date))[0];
  }

  function addRun(run: RunPrescription, day: Day, rationale: string[], priority: number) {
    used.add(day.date);
    cardioCount++;
    sessions.push({
      id: `${day.date}-run-${run.slot}`,
      date: day.date,
      kind: 'run',
      run,
      intensity: run.intensity,
      minutes: run.totalMin,
      load: plannedLoad('run', run.intensity, run.totalMin),
      priority,
      status: 'planned',
      rationale,
    });
  }

  const [plannedA, plannedB] = fiveKWeek(input.fiveK, !allEasy);
  const weekendBonus = (d: Day) => (isoWeekday(d.date) >= 6 ? 1 : 0);

  // Run B: the long (only possibly hard) session, away from leg days.
  if (cardioCount < cardioLimit) {
    let runB = plannedB;
    let day = pick('run', runB.totalMin, (d) => (runB.intensity === 'hard' && nextToLegs(d.date) ? -100 : 0) + weekendBonus(d) * 3);
    if (day && runB.intensity === 'hard' && nextToLegs(day.date)) {
      runB = fiveKWeek(input.fiveK, false)[1];
      day = pick('run', runB.totalMin, (d) => weekendBonus(d) * 3);
    }
    if (day) {
      const why = [`${runB.title} el ${dayName(day.date)}.`];
      if (runB.intensity === 'hard') why.push('Es la única sesión exigente de la semana y no toca el día antes ni después de pierna.');
      else if (plannedB.intensity === 'hard') why.push('Hoy en suave: no hay hueco para una sesión fuerte lejos de la pierna.');
      if (allEasy && !deload) why.push('Semana de 5 días de gimnasio: todo el cardio en suave.');
      if (deload) why.push('Semana de descarga: cardio solo suave.');
      addRun(runB, day, why, 3);
    }
  }

  // Run A: intervals, as far as possible from run B.
  if (cardioCount < cardioLimit) {
    const day = pick('run', plannedA.totalMin, (d) => Math.min(3, ...runDates().map((r) => dist(r, d.date)), 3) * 2);
    if (day) addRun(plannedA, day, [`${plannedA.title} el ${dayName(day.date)}, separado de la otra carrera.`], 3);
  }
  // Gym comes first: if runs don't fit, the 5K simply stays where it is (no warning needed).

  // Swims: preferably the day after legs or after the long run.
  const longRunDate = sessions.find((s) => s.run?.slot === 'B')?.date;
  const swimScore = (d: Day) =>
    (legDates.some((l) => addDays(l, 1) === d.date) ? 3 : 0) + (longRunDate && addDays(longRunDate, 1) === d.date ? 3 : 0) - (runDates().some((r) => dist(r, d.date) === 0) ? 10 : 0);
  const swimTarget = 2;
  const addSwim = (n: number) => {
    const moderate = gymDays === 0 && n === 2 && !deload;
    const sw = swimSession(input.swim, moderate ? 'moderate' : 'easy', input.swimPacePer100);
    const day = pick('swim', sw.totalMin, swimScore);
    if (!day || cardioCount >= cardioLimit) return false;
    used.add(day.date);
    cardioCount++;
    const why = [`Natación el ${dayName(day.date)}.`];
    if (legDates.some((l) => addDays(l, 1) === day.date)) why.push('Va bien el día después de pierna: descarga las piernas.');
    else if (longRunDate && addDays(longRunDate, 1) === day.date) why.push('El día después de la carrera larga, para recuperar.');
    if (moderate) why.push('Semana sin gimnasio: una de las nataciones es moderada.');
    sessions.push({
      id: `${day.date}-swim`,
      date: day.date,
      kind: 'swim',
      swim: sw,
      intensity: sw.intensity,
      minutes: sw.totalMin,
      load: plannedLoad('swim', sw.intensity, sw.totalMin),
      priority: 1,
      status: 'planned',
      rationale: why,
    });
    return true;
  };

  addSwim(1);
  // Optional third run (always easy), not on the day right after another run if avoidable.
  if (cardioCount < cardioLimit && gymDays < 5) {
    const c = easyThirdRun(input.fiveK);
    const day = pick('run', c.totalMin, (d) => Math.min(3, ...runDates().map((r) => dist(r, d.date))));
    if (day && runDates().every((r) => dist(r, day.date) > 1)) addRun(c, day, ['Tercera carrera opcional, muy suave.'], 2);
  }
  if (sessions.filter((s) => s.kind === 'swim').length < swimTarget) addSwim(2);

  // ---- Step 4: at least one full rest day with ≥ 6 sessions ----------------
  const sortByPriority = () => [...sessions].sort((a, b) => a.priority - b.priority || b.date.localeCompare(a.date));
  if (sessions.length >= 7) {
    const drop = sortByPriority()[0]!;
    sessions.splice(sessions.indexOf(drop), 1);
    warnings.push(`Quitada ${label(drop)} del ${dayName(drop.date)} para tener un día de descanso completo.`);
  }

  // ---- Step 4: weekly load limit ------------------------------------------
  const cap = loadCap(input.previousWeekLoads);
  if (cap) {
    const total = () => sessions.reduce((a, s) => a + s.load, 0);
    const reductions: Array<() => string | undefined> = [
      () => {
        const b = sessions.find((s) => s.run?.slot === 'B' && s.intensity === 'hard');
        if (!b) return undefined;
        const easyB = fiveKWeek(input.fiveK, false)[1];
        Object.assign(b, { run: easyB, intensity: easyB.intensity, load: plannedLoad('run', easyB.intensity, easyB.totalMin) });
        b.rationale.push('En suave para no pasar del límite de carga semanal.');
        return 'La tirada larga pasa a suave';
      },
      // Cardio is cut first (easy run, swims, key runs); gym sessions are never cut for load.
      ...[2, 1, 1, 3, 3].map((priority) => () => {
        const s = sortByPriority().find((x) => x.priority === priority);
        if (!s) return undefined;
        sessions.splice(sessions.indexOf(s), 1);
        return `Quitada ${label(s)} del ${dayName(s.date)}`;
      }),
    ];
    const applied: string[] = [];
    for (const r of reductions) {
      if (total() <= cap.limit) break;
      const done = r();
      if (done) applied.push(done);
    }
    if (applied.length) warnings.push(`${cap.reason} ${applied.join('; ')}.`);
    if (total() > cap.limit) {
      warnings.push('Aun así la semana supera el límite de carga: el gimnasio se mantiene completo. Ve con calma y vigila el semáforo.');
    }
  }

  // ---- Step 5: steps -------------------------------------------------------
  const cardio = sessions.filter((s) => s.kind === 'run' || s.kind === 'swim').length;
  const stepTargets: Record<DateKey, number> = {};
  for (const d of days) {
    const hasSession = sessions.some((s) => s.date === d.date);
    stepTargets[d.date] = !hasSession && cardio <= 1 ? Math.max(12000, input.stepGoal) : input.stepGoal;
  }
  if (cardio <= 1) warnings.push('Semana con poco cardio: objetivo de 12.000 pasos los días sin sesión.');
  if (deload) warnings.unshift('Semana de descarga (4.ª del bloque): 40 % menos de series y cardio solo suave.');

  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return {
    weekStart: input.weekStart,
    availability: input.availability,
    maxGymDays: input.maxGymDays,
    sessions,
    stepTargets,
    warnings,
    deload,
    fiveK: input.fiveK,
    swimState: input.swim,
    createdAt: now,
    updatedAt: now,
  };
}

export function label(s: PlannedSession): string {
  if (s.kind === 'gym') return `la sesión de ${s.gymTemplate}`;
  if (s.kind === 'run') return s.run?.slot === 'C' ? 'la carrera suave' : `la carrera (${s.run?.title.toLowerCase()})`;
  if (s.kind === 'swim') return 'la natación';
  return 'la sesión';
}

/**
 * Weekly load limit (spec 6 step 4): ≤ 1.1 × mean of the 3 previous weeks; after a break (last
 * week < 40 % of the weeks before) start at 70 % of the usual level. No history → no limit.
 */
export function loadCap(previous: ReadonlyArray<number>): { limit: number; reason: string } | undefined {
  const last3 = previous.slice(-3);
  if (last3.length < 3 || last3.every((x) => x === 0)) return undefined;
  const before = previous.slice(0, -1).filter((x) => x > 0);
  const usual = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0;
  const lastWeek = previous[previous.length - 1]!;
  if (usual > 0 && lastWeek < usual * 0.4) {
    return { limit: usual * 0.7, reason: 'Vuelta tras un parón: carga al 70 % de lo habitual.' };
  }
  const mean = last3.reduce((a, b) => a + b, 0) / 3;
  return { limit: mean * 1.1, reason: 'Límite de carga (+10 % sobre las 3 semanas anteriores):' };
}
