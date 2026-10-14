// The user's Symmetry ranks, derived deterministically from logged sets (Epley e1RM / body weight).

import { epley, type SessionLike } from '../../domain/strength/strength';
import {
  RANK_TIERS,
  SYMMETRY_EXERCISES,
  calculateSymmetryRank,
  type CalculatedRank,
  type SymmetryExercise,
} from './symmetryCatalog';

interface NamedExercise {
  id: string;
  name: string;
  aliases: string[];
}

interface BestSetLike {
  exerciseId: string;
  weightKg: number;
  reps: number;
  date?: string;
}

/**
 * Symmetry catalog entry for a FitPlan exercise id: numeric Symmetry ids map directly, otherwise
 * only an exact (case-insensitive) match of the name or an alias counts. No fuzzy guessing.
 */
export function symmetryExerciseFor(
  exerciseId: string,
  exercises: ReadonlyArray<NamedExercise>,
  catalog: ReadonlyArray<SymmetryExercise> = SYMMETRY_EXERCISES,
): SymmetryExercise | undefined {
  if (/^\d+$/.test(exerciseId)) {
    const byId = catalog.find((e) => e.id === Number(exerciseId));
    if (byId) return byId;
  }
  const ex = exercises.find((e) => e.id === exerciseId);
  const names = new Set([exerciseId, ...(ex ? [ex.name, ...ex.aliases] : [])].map((n) => n.trim().toLowerCase()));
  return catalog.find((c) => names.has(c.name.trim().toLowerCase()));
}

export interface ExerciseRank {
  exercise: SymmetryExercise;
  e1rm: number;
  weightKg: number;
  reps: number;
  date?: string;
  rank: CalculatedRank;
  /** Index in RANK_TIERS, or -1 when below Iron I. */
  tierIndex: number;
}

export function tierIndexOf(rank: CalculatedRank): number {
  if (rank.name.startsWith('Sin rango')) return -1;
  return RANK_TIERS.findIndex((t) => t.id === rank.tierId);
}

/** Best e1RM per ranked Symmetry exercise across sessions and seed best sets, with its rank. */
export function userExerciseRanks(
  sessions: ReadonlyArray<SessionLike>,
  bestSets: ReadonlyArray<BestSetLike>,
  exercises: ReadonlyArray<NamedExercise>,
  bodyKg: number,
  catalog: ReadonlyArray<SymmetryExercise> = SYMMETRY_EXERCISES,
): ExerciseRank[] {
  const best = new Map<number, { e1rm: number; weightKg: number; reps: number; date?: string }>();
  const consider = (exerciseId: string, weightKg: number, reps: number, date?: string) => {
    const e = epley(weightKg, reps);
    if (e === undefined) return;
    const sym = symmetryExerciseFor(exerciseId, exercises, catalog);
    if (!sym?.rankThresholds) return;
    const cur = best.get(sym.id);
    if (!cur || e > cur.e1rm) best.set(sym.id, { e1rm: e, weightKg, reps, date });
  };
  for (const s of sessions) for (const set of s.sets) if (!set.skipped) consider(set.exerciseId, set.weightKg, set.reps, s.date ?? undefined);
  for (const b of bestSets) consider(b.exerciseId, b.weightKg, b.reps, b.date);

  const out: ExerciseRank[] = [];
  for (const [id, b] of best) {
    const exercise = catalog.find((c) => c.id === id)!;
    const rank = calculateSymmetryRank(exercise, b.e1rm, bodyKg);
    if (!rank) continue;
    out.push({ exercise, ...b, rank, tierIndex: tierIndexOf(rank) });
  }
  return out.sort((a, b) => b.tierIndex - a.tierIndex || b.rank.ratio - a.rank.ratio);
}

/** Overall tier: the rounded-down mean tier of the given exercise ranks (-1 = unranked). */
export function averageTierIndex(ranks: ReadonlyArray<ExerciseRank>): number | null {
  if (ranks.length === 0) return null;
  const mean = ranks.reduce((sum, r) => sum + r.tierIndex, 0) / ranks.length;
  return Math.floor(mean);
}

/** Exercise ids (Symmetry) whose tier went up compared with a previously seen snapshot. */
export function rankUps(current: ReadonlyArray<ExerciseRank>, seen: Readonly<Record<string, number>>): ExerciseRank[] {
  return current.filter((r) => {
    const prev = seen[String(r.exercise.id)];
    return prev !== undefined && r.tierIndex > prev;
  });
}
