import { describe, expect, it } from 'vitest';
import { muscleDistribution, musclesText } from './symmetryMuscles';

describe('symmetryMuscles', () => {
  it('lists focus then secondary muscles with Symmetry labels', () => {
    expect(musclesText({ focus: 'quadriceps', secondary: ['glutes', 'hamstrings', 'adductors'] })).toBe(
      'Cuádriceps, Glúteos, Femoral, Aductores',
    );
  });

  it('weights focus 1 and secondary 0.5', () => {
    const d = muscleDistribution([
      { focus: 'quadriceps', secondary: ['glutes'] },
      { focus: 'hamstrings', secondary: [] },
      { focus: 'quadriceps', secondary: [] },
    ]);
    // quads 2, hamstrings 1, glutes 0.5 of 3.5
    expect(d).toEqual([
      { key: 'quadriceps', label: 'Cuádriceps', percent: 57 },
      { key: 'hamstrings', label: 'Femoral', percent: 29 },
      { key: 'glutes', label: 'Glúteos', percent: 14 },
    ]);
  });

  it('returns nothing for an empty session', () => {
    expect(muscleDistribution([])).toEqual([]);
  });
});
