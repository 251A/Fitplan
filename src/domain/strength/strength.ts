// Strength analysis (spec 7.3 and 7.4). Pure functions over plain data.

import { addDays, isoWeekday, type DateKey } from '../dates';

export type Muscle =
  | 'chest'
  | 'frontDelts'
  | 'sideDelts'
  | 'rearDelts'
  | 'triceps'
  | 'lats'
  | 'upperBack'
  | 'biceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'abductors';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Pecho',
  frontDelts: 'Hombro frontal',
  sideDelts: 'Hombro lateral',
  rearDelts: 'Hombro posterior',
  triceps: 'Tríceps',
  lats: 'Dorsales',
  upperBack: 'Espalda alta',
  biceps: 'Bíceps',
  forearms: 'Antebrazo',
  quads: 'Cuádriceps',
  hamstrings: 'Isquios',
  glutes: 'Glúteos',
  abductors: 'Abductores',
};

export type LoadMode = 'total' | 'perDumbbell' | 'unconfirmed';
export type Equipment = 'barbell' | 'smith' | 'machine' | 'cable' | 'dumbbell' | 'bodyweight';

export interface ExerciseInfo {
  id: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  equipment: Equipment;
  loadMode: LoadMode;
}

export interface SetLike {
  exerciseId: string;
  weightKg: number;
  reps: number;
  skipped: boolean;
}

export interface SessionLike {
  date: DateKey | null;
  sets: SetLike[];
}

// ---- 1RM ---------------------------------------------------------------------

/** Epley estimate, only for sets of 1–12 reps with weight > 0 (otherwise undefined). */
export function epley(weightKg: number, reps: number): number | undefined {
  if (weightKg <= 0 || reps < 1 || reps > 12) return undefined;
  return weightKg * (1 + reps / 30);
}

/** Best estimated 1RM of an exercise within one session. */
export function bestE1RM(sets: ReadonlyArray<SetLike>, exerciseId: string): number | undefined {
  let best: number | undefined;
  for (const s of sets) {
    if (s.skipped || s.exerciseId !== exerciseId) continue;
    const e = epley(s.weightKg, s.reps);
    if (e !== undefined && (best === undefined || e > best)) best = e;
  }
  return best;
}

export interface E1RMPoint {
  date: DateKey;
  e1rm: number;
}

/** Best estimated 1RM per dated session, chronological. */
export function e1rmHistory(sessions: ReadonlyArray<SessionLike>, exerciseId: string): E1RMPoint[] {
  const byDate = new Map<DateKey, number>();
  for (const s of sessions) {
    if (!s.date) continue;
    const e = bestE1RM(s.sets, exerciseId);
    if (e !== undefined) byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, e));
  }
  return [...byDate.entries()].map(([date, e1rm]) => ({ date, e1rm })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Stagnation: no improvement of the best e1RM during the last `weeks` weeks compared with the
 * best before that window. Needs data both before and inside the window.
 */
export function isStagnant(history: ReadonlyArray<E1RMPoint>, today: DateKey, weeks = 3): boolean {
  const cutoff = addDays(today, -weeks * 7);
  const before = history.filter((p) => p.date < cutoff);
  const recent = history.filter((p) => p.date >= cutoff);
  if (before.length === 0 || recent.length === 0) return false;
  const bestBefore = Math.max(...before.map((p) => p.e1rm));
  const bestRecent = Math.max(...recent.map((p) => p.e1rm));
  return bestRecent <= bestBefore;
}

// ---- Relative strength --------------------------------------------------------

export interface WeeklyStrength {
  week: DateKey; // Monday
  e1rm: number; // best of the week
  bodyKg?: number; // closest body weight
}

/** Best e1RM per ISO week. */
export function weeklyBest(history: ReadonlyArray<E1RMPoint>): Array<{ week: DateKey; e1rm: number }> {
  const byWeek = new Map<DateKey, number>();
  for (const p of history) {
    const w = weekStart(p.date);
    byWeek.set(w, Math.max(byWeek.get(w) ?? 0, p.e1rm));
  }
  return [...byWeek.entries()].map(([week, e1rm]) => ({ week, e1rm })).sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Possible muscle loss (spec 7.4): 1RM / body weight drops two weeks in a row while body weight
 * also drops. Uses the last three weeks with both values.
 */
export function relativeStrengthWarning(weeks: ReadonlyArray<WeeklyStrength>): boolean {
  const w = weeks.filter((x) => x.bodyKg !== undefined && x.bodyKg > 0).slice(-3);
  if (w.length < 3) return false;
  const rel = w.map((x) => x.e1rm / x.bodyKg!);
  const relDrops = rel[1]! < rel[0]! && rel[2]! < rel[1]!;
  const weightDrops = w[2]!.bodyKg! < w[0]!.bodyKg!;
  return relDrops && weightDrops;
}

// ---- Weekly volume per muscle -----------------------------------------------

export function weekStart(date: DateKey): DateKey {
  return addDays(date, -(isoWeekday(date) - 1));
}

/** Effective sets (not skipped) per muscle in the ISO week starting at `monday`: primary 1, secondary 0.5. */
export function weeklySetsPerMuscle(
  sessions: ReadonlyArray<SessionLike>,
  exercises: ReadonlyMap<string, ExerciseInfo>,
  monday: DateKey,
): Map<Muscle, number> {
  const end = addDays(monday, 7);
  const out = new Map<Muscle, number>();
  for (const s of sessions) {
    if (!s.date || s.date < monday || s.date >= end) continue;
    for (const set of s.sets) {
      if (set.skipped) continue;
      const ex = exercises.get(set.exerciseId);
      if (!ex) continue;
      out.set(ex.primaryMuscle, (out.get(ex.primaryMuscle) ?? 0) + 1);
      for (const m of ex.secondaryMuscles) out.set(m, (out.get(m) ?? 0) + 0.5);
    }
  }
  return out;
}

export interface VolumeWarning {
  muscle: Muscle;
  sets: number;
  reason: 'low' | 'farBelow';
}

/** Groups trained this week with < `min` sets, or far below the median of the trained groups. */
export function volumeWarnings(perMuscle: ReadonlyMap<Muscle, number>, min = 8, farBelowRatio = 0.5): VolumeWarning[] {
  const values = [...perMuscle.values()].sort((a, b) => a - b);
  if (values.length === 0) return [];
  const median = values[Math.floor(values.length / 2)]!;
  const out: VolumeWarning[] = [];
  for (const [muscle, sets] of perMuscle) {
    if (sets < min) out.push({ muscle, sets, reason: 'low' });
    else if (sets < median * farBelowRatio) out.push({ muscle, sets, reason: 'farBelow' });
  }
  return out.sort((a, b) => a.sets - b.sets);
}

// ---- Double progression -----------------------------------------------------

/** Suggested increment when every working set reached the top of the rep range (spec 7.4). */
export function doubleProgression(
  sets: ReadonlyArray<SetLike>,
  exercise: ExerciseInfo,
  repRange: { min: number; max: number } = { min: 8, max: 12 },
): { nextWeightKg: number; increment: number } | undefined {
  const working = sets.filter((s) => !s.skipped && s.exerciseId === exercise.id && s.weightKg > 0);
  if (working.length === 0) return undefined;
  const top = Math.max(...working.map((s) => s.weightKg));
  const atTop = working.filter((s) => s.weightKg === top);
  if (!atTop.every((s) => s.reps >= repRange.max)) return undefined;
  const increment = exercise.equipment === 'dumbbell' ? (top < 10 ? 1 : 2) : 2.5;
  return { nextWeightKg: top + increment, increment };
}

// ---- Weight normalisation (spec 7.3) ----------------------------------------

/** Stores dumbbell work per dumbbell: when the user says the logged weight was the pair, halve it. */
export function normalizeWeight(weightKg: number, mode: LoadMode, loggedAsPair: boolean): number {
  return mode === 'perDumbbell' && loggedAsPair ? weightKg / 2 : weightKg;
}

/** A jump of more than 40 % versus the last time is suspicious (pair? machine?). */
export function isSuspiciousJump(previousKg: number | undefined, currentKg: number, threshold = 0.4): boolean {
  if (previousKg === undefined || previousKg <= 0 || currentKg <= 0) return false;
  return Math.abs(currentKg - previousKg) / previousKg > threshold;
}
