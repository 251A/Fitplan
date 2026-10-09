import type { Exercise, GymSession, SeedBestSet } from '../../data/db/models';

export interface LastSet {
  weightKg: number;
  reps: number;
  date?: string;
  fromSeed: boolean;
}

const datedDesc = (sessions: ReadonlyArray<GymSession>) =>
  sessions.filter((s) => s.date).sort((a, b) => b.date!.localeCompare(a.date!));

/** Top set of the most recent session with this exercise (before `beforeDate`), else the seed best set. */
export function lastSetFor(
  exerciseId: string,
  sessions: ReadonlyArray<GymSession>,
  bestSets: ReadonlyArray<SeedBestSet>,
  beforeDate?: string,
): LastSet | undefined {
  for (const s of datedDesc(sessions)) {
    if (beforeDate && s.date! >= beforeDate) continue;
    const sets = s.sets.filter((x) => x.exerciseId === exerciseId && !x.skipped && x.weightKg > 0);
    if (sets.length === 0) continue;
    const top = sets.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
    return { weightKg: top.weightKg, reps: top.reps, date: s.date!, fromSeed: false };
  }
  const seed = bestSets
    .filter((b) => b.exerciseId === exerciseId && (!beforeDate || !b.date || b.date < beforeDate))
    .sort((a, b) => b.weightKg - a.weightKg)[0];
  return seed ? { weightKg: seed.weightKg, reps: seed.reps, date: seed.date, fromSeed: true } : undefined;
}

/** Sessions plus the seed best sets as pseudo-sessions, for 1RM history from day one. */
export function sessionsWithSeed(sessions: ReadonlyArray<GymSession>, bestSets: ReadonlyArray<SeedBestSet>) {
  const pseudo = bestSets
    .filter((b) => b.date)
    .map((b) => ({ date: b.date!, sets: [{ exerciseId: b.exerciseId, weightKg: b.weightKg, reps: b.reps, skipped: false }] }));
  return [...sessions, ...pseudo];
}

export const kg = (v: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v)} kg`;

export function exerciseWeightLabel(ex: Exercise, weightKg: number): string {
  return `${kg(weightKg)}${ex.loadMode === 'perDumbbell' ? ' /manc.' : ''}`;
}

export const TEMPLATE_NAMES = ['Empuje A', 'Tracción A', 'Pierna', 'Empuje B', 'Tracción B', 'Tren superior', 'Cuerpo completo', 'Empuje', 'Tracción'];
