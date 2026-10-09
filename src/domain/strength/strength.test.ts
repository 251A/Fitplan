import { describe, expect, it } from 'vitest';
import {
  bestE1RM,
  doubleProgression,
  e1rmHistory,
  epley,
  isStagnant,
  isSuspiciousJump,
  normalizeWeight,
  relativeStrengthWarning,
  volumeWarnings,
  weeklyBest,
  weeklySetsPerMuscle,
  weekStart,
  type ExerciseInfo,
} from './strength';

const bench: ExerciseInfo = { id: 'bench', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'frontDelts'], equipment: 'barbell', loadMode: 'total' };
const curl: ExerciseInfo = { id: 'curl', primaryMuscle: 'biceps', secondaryMuscles: [], equipment: 'dumbbell', loadMode: 'perDumbbell' };
const s = (exerciseId: string, weightKg: number, reps: number, skipped = false) => ({ exerciseId, weightKg, reps, skipped });

describe('Epley', () => {
  it('matches the spec examples', () => {
    expect(epley(55, 9)).toBeCloseTo(71.5, 5); // ~72 kg bench
    expect(epley(140, 10)).toBeCloseTo(186.67, 2); // ~187 kg leg press
    expect(epley(60, 7)).toBeCloseTo(74, 5);
  });

  it('only uses 1–12 reps and positive weight', () => {
    expect(epley(30, 18)).toBeUndefined();
    expect(epley(0, 10)).toBeUndefined();
    expect(epley(100, 1)).toBeCloseTo(103.33, 2);
    expect(epley(100, 12)).toBeCloseTo(140, 5);
  });

  it('ignores skipped sets (0 kg = not done)', () => {
    expect(bestE1RM([s('bench', 55, 9, true), s('bench', 45, 9)], 'bench')).toBeCloseTo(58.5, 5);
    expect(bestE1RM([s('bench', 0, 10, true)], 'bench')).toBeUndefined();
  });

  it('builds a per-session history, ignoring undated sessions', () => {
    const h = e1rmHistory(
      [
        { date: '2026-09-22', sets: [s('bench', 55, 9)] },
        { date: '2026-09-11', sets: [s('bench', 50, 8), s('bench', 52.5, 6)] },
        { date: null, sets: [s('bench', 70, 5)] },
      ],
      'bench',
    );
    expect(h.map((p) => p.date)).toEqual(['2026-09-11', '2026-09-22']);
  });
});

describe('stagnation', () => {
  const today = '2026-10-09';
  it('flags no improvement in the last 3 weeks', () => {
    expect(isStagnant([{ date: '2026-09-01', e1rm: 72 }, { date: '2026-10-01', e1rm: 72 }], today)).toBe(true);
    expect(isStagnant([{ date: '2026-09-01', e1rm: 72 }, { date: '2026-10-01', e1rm: 73 }], today)).toBe(false);
  });
  it('needs data before and inside the window', () => {
    expect(isStagnant([{ date: '2026-10-01', e1rm: 72 }], today)).toBe(false);
  });
});

describe('relative strength', () => {
  it('warns when 1RM/bodyweight drops two weeks in a row while weight drops', () => {
    expect(
      relativeStrengthWarning([
        { week: 'a', e1rm: 72, bodyKg: 71.4 },
        { week: 'b', e1rm: 70, bodyKg: 71.0 },
        { week: 'c', e1rm: 67, bodyKg: 70.6 },
      ]),
    ).toBe(true);
  });
  it('does not warn when strength holds while losing weight (the goal)', () => {
    expect(
      relativeStrengthWarning([
        { week: 'a', e1rm: 72, bodyKg: 71.4 },
        { week: 'b', e1rm: 72, bodyKg: 71.0 },
        { week: 'c', e1rm: 72.5, bodyKg: 70.6 },
      ]),
    ).toBe(false);
  });
  it('groups the best e1RM per ISO week', () => {
    expect(weeklyBest([{ date: '2026-10-05', e1rm: 70 }, { date: '2026-10-09', e1rm: 72 }, { date: '2026-10-12', e1rm: 71 }])).toEqual([
      { week: '2026-10-05', e1rm: 72 },
      { week: '2026-10-12', e1rm: 71 },
    ]);
  });
});

describe('weekly volume', () => {
  const exercises = new Map([
    ['bench', bench],
    ['curl', curl],
  ]);
  it('counts primary 1, secondary 0.5 and skips skipped sets and other weeks', () => {
    const monday = weekStart('2026-10-08');
    expect(monday).toBe('2026-10-05');
    const v = weeklySetsPerMuscle(
      [
        { date: '2026-10-05', sets: [s('bench', 50, 10), s('bench', 50, 10), s('bench', 0, 10, true), s('curl', 12, 10)] },
        { date: '2026-10-12', sets: [s('bench', 50, 10)] },
      ],
      exercises,
      monday,
    );
    expect(v.get('chest')).toBe(2);
    expect(v.get('triceps')).toBe(1);
    expect(v.get('biceps')).toBe(1);
  });

  it('warns about low and far-below groups', () => {
    const w = volumeWarnings(new Map([['chest', 12], ['lats', 14], ['quads', 4], ['biceps', 10]] as const));
    expect(w).toEqual([{ muscle: 'quads', sets: 4, reason: 'low' }]);
  });
});

describe('double progression', () => {
  it('suggests +2.5 kg on barbell/machine when all top sets hit the top of the range', () => {
    expect(doubleProgression([s('bench', 50, 12), s('bench', 50, 12)], bench)).toEqual({ nextWeightKg: 52.5, increment: 2.5 });
    expect(doubleProgression([s('bench', 50, 12), s('bench', 50, 10)], bench)).toBeUndefined();
  });
  it('suggests +1–2 kg on dumbbells', () => {
    expect(doubleProgression([s('curl', 8, 12)], curl)?.increment).toBe(1);
    expect(doubleProgression([s('curl', 12, 12)], curl)?.increment).toBe(2);
  });
});

describe('weight normalisation', () => {
  it('halves pair weights for per-dumbbell exercises (confirmed examples)', () => {
    expect(normalizeWeight(24, 'perDumbbell', true)).toBe(12); // incline curl
    expect(normalizeWeight(20, 'perDumbbell', true)).toBe(10); // hammer curl
    expect(normalizeWeight(16, 'perDumbbell', true)).toBe(8); // seated lateral raise
    expect(normalizeWeight(10, 'perDumbbell', false)).toBe(10);
    expect(normalizeWeight(60, 'total', true)).toBe(60);
  });
  it('flags jumps above 40 %', () => {
    expect(isSuspiciousJump(12, 24)).toBe(true);
    expect(isSuspiciousJump(10, 14)).toBe(false); // exactly 40 %
    expect(isSuspiciousJump(undefined, 24)).toBe(false);
  });
});
