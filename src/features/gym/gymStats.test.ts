import { describe, expect, it } from 'vitest';
import type { GymSession } from '../../data/db/models';
import { suggestNextSet } from './gymStats';

const session = (date: string, sets: Array<[number, number]>): GymSession =>
  ({
    id: date,
    date,
    templateName: 'Pierna',
    source: 'app',
    durationMin: 50,
    sets: sets.map(([weightKg, reps], order) => ({ exerciseId: 'prensa', order, weightKg, reps, skipped: false })),
  }) as unknown as GymSession;

describe('suggestNextSet', () => {
  it('repeats the last top set when the rep range is not maxed', () => {
    expect(suggestNextSet('prensa', 'machine', [session('2026-10-01', [[140, 10], [140, 9]])], [])).toEqual({
      weightKg: 140,
      reps: 10,
      progressed: false,
    });
  });

  it('adds 2.5 kg and resets reps when every top set hit 12', () => {
    expect(suggestNextSet('prensa', 'machine', [session('2026-10-01', [[140, 12], [140, 12]])], [])).toEqual({
      weightKg: 142.5,
      reps: 8,
      progressed: true,
    });
  });

  it('uses the most recent session and small dumbbell steps', () => {
    const s = [session('2026-09-01', [[10, 12]]), session('2026-10-01', [[8, 12]])];
    expect(suggestNextSet('prensa', 'dumbbell', s, [])).toEqual({ weightKg: 9, reps: 8, progressed: true });
  });

  it('returns nothing without history', () => {
    expect(suggestNextSet('prensa', 'machine', [], [])).toBeUndefined();
  });
});
