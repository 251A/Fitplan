import { describe, expect, it } from 'vitest';
import type { SymmetryExercise } from './symmetryCatalog';
import { averageTierIndex, rankUps, symmetryExerciseFor, userExerciseRanks } from './userRanks';

const thresholds = Array.from({ length: 25 }, (_, i) => 0.5 + i * 0.1);
const catalog: SymmetryExercise[] = [
  { id: 10, name: 'Press De Banca Plano (Barra Recta)', implement: 'barbell', category: 'push', primaryMuscle: 'chest', loggedUnit: 'total', loadDivisor: 1, rankThresholds: { male: thresholds, female: thresholds } },
  { id: 20, name: 'Prensa 45° (Máquina)', implement: 'machine', category: 'legs', primaryMuscle: 'quads', loggedUnit: 'total', loadDivisor: 1, rankThresholds: { male: thresholds, female: thresholds } },
  { id: 30, name: 'Sin Umbrales', implement: 'machine', category: 'legs', primaryMuscle: 'quads', loggedUnit: 'total', loadDivisor: 1, rankThresholds: null },
];
const exercises = [
  { id: 'bench', name: 'Press de banca plano (barra recta)', aliases: [] },
  { id: 'press', name: 'Prensa', aliases: ['Prensa 45° (Máquina)'] },
  { id: 'other', name: 'Press de banca', aliases: [] },
];

describe('symmetryExerciseFor', () => {
  it('matches numeric ids, names and aliases exactly', () => {
    expect(symmetryExerciseFor('20', exercises, catalog)?.id).toBe(20);
    expect(symmetryExerciseFor('bench', exercises, catalog)?.id).toBe(10);
    expect(symmetryExerciseFor('press', exercises, catalog)?.id).toBe(20);
  });

  it('does not guess on partial names', () => {
    expect(symmetryExerciseFor('other', exercises, catalog)).toBeUndefined();
  });
});

describe('userExerciseRanks', () => {
  it('keeps the best e1RM per exercise from sessions and seed sets', () => {
    const sessions = [
      { date: '2026-09-01', sets: [{ exerciseId: 'bench', weightKg: 60, reps: 5, skipped: false }] },
      { date: '2026-09-08', sets: [{ exerciseId: 'bench', weightKg: 200, reps: 5, skipped: true }] },
    ];
    const seed = [{ exerciseId: 'bench', weightKg: 55, reps: 9, date: '2026-09-22' }];
    const ranks = userExerciseRanks(sessions, seed, exercises, 70, catalog);
    expect(ranks).toHaveLength(1);
    expect(ranks[0]!.weightKg).toBe(55);
    expect(ranks[0]!.e1rm).toBeCloseTo(55 * 1.3);
    // ratio 71.5 / 70 ≈ 1.02 → thresholds 0.5..; index 5 (1.0) reached, 1.1 not.
    expect(ranks[0]!.tierIndex).toBe(5);
  });

  it('marks ratios below the first threshold as unranked and skips exercises without thresholds', () => {
    const sessions = [{ date: '2026-09-01', sets: [{ exerciseId: 'press', weightKg: 20, reps: 10, skipped: false }, { exerciseId: '30', weightKg: 100, reps: 10, skipped: false }] }];
    const ranks = userExerciseRanks(sessions, [], exercises, 70, catalog);
    expect(ranks.map((r) => [r.exercise.id, r.tierIndex])).toEqual([[20, -1]]);
  });
});

describe('averageTierIndex and rankUps', () => {
  it('rounds the mean down and detects improvements against a snapshot', () => {
    const sessions = [
      { date: '2026-09-01', sets: [{ exerciseId: 'bench', weightKg: 55, reps: 9, skipped: false }, { exerciseId: 'press', weightKg: 140, reps: 10, skipped: false }] },
    ];
    const ranks = userExerciseRanks(sessions, [], exercises, 70, catalog);
    const byId = Object.fromEntries(ranks.map((r) => [r.exercise.id, r.tierIndex]));
    expect(averageTierIndex(ranks)).toBe(Math.floor((byId[10]! + byId[20]!) / 2));
    expect(averageTierIndex([])).toBeNull();
    expect(rankUps(ranks, { 10: byId[10]! - 1, 20: byId[20]! }).map((r) => r.exercise.id)).toEqual([10]);
    expect(rankUps(ranks, {})).toEqual([]);
  });
});
