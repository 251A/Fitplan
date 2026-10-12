import { describe, expect, it } from 'vitest';
import { calculateSymmetryRank, findSymmetryExercise, SYMMETRY_EXERCISES } from './symmetryCatalog';

describe('symmetryCatalog', () => {
  it('loads 155 canonical exercises from Symmetry', () => {
    expect(SYMMETRY_EXERCISES.length).toBe(155);
    const sentadilla = findSymmetryExercise('Sentadilla (Barra Alta)');
    expect(sentadilla).toBeDefined();
    expect(sentadilla?.id).toBe(1);
    expect(sentadilla?.implement).toBe('barbell');
  });

  it('calculates rank accurately based on 1RM and bodyweight', () => {
    // Sentadilla: bodyweight 70kg, 1RM 70kg -> ratio 1.0 -> matches threshold index 8 (Plata III)
    const rankSilver = calculateSymmetryRank(1, 70, 70, 'male');
    expect(rankSilver).toBeDefined();
    expect(rankSilver?.name).toBe('Plata III');
    expect(rankSilver?.svg).toContain('rank=silver3');

    // Ratio 1.1 -> matches threshold index 10 (Oro II)
    const rankGold = calculateSymmetryRank(1, 77, 70, 'male');
    expect(rankGold?.name).toBe('Oro II');
    expect(rankGold?.svg).toContain('rank=gold2');
  });

  it('handles sub-Iron ranks gracefully', () => {
    const rank = calculateSymmetryRank(1, 20, 70, 'male');
    expect(rank).toBeDefined();
    expect(rank?.name).toContain('Sin rango');
  });
});
