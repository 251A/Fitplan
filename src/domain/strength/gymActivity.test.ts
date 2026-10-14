import { describe, expect, it } from 'vitest';
import { personalRecords, sessionVolumeKg, trainedDays, weeklyStreak, weeklyVolumeSeries } from './gymActivity';
import type { SessionLike } from './strength';

const set = (exerciseId: string, weightKg: number, reps: number, skipped = false) => ({ exerciseId, weightKg, reps, skipped });
const session = (date: string | null, sets = [set('bench', 50, 10)]): SessionLike => ({ date, sets });

// 2026-10-12 is a Monday.
const TODAY = '2026-10-14';

describe('sessionVolumeKg', () => {
  it('sums kg × reps of effective sets only', () => {
    expect(sessionVolumeKg(session('2026-10-01', [set('a', 50, 10), set('a', 0, 10), set('b', 20, 5, true)]))).toBe(500);
  });
});

describe('weeklyStreak', () => {
  it('counts consecutive weeks back from the current one', () => {
    const s = [session('2026-10-13'), session('2026-10-07'), session('2026-09-29')];
    expect(weeklyStreak(s, TODAY)).toBe(3);
  });

  it('does not break the streak while the current week is still empty', () => {
    const s = [session('2026-10-07'), session('2026-09-29')];
    expect(weeklyStreak(s, TODAY)).toBe(2);
  });

  it('stops at the first week below the minimum', () => {
    const s = [session('2026-10-13'), session('2026-09-22')];
    expect(weeklyStreak(s, TODAY)).toBe(1);
  });

  it('respects minPerWeek and ignores future and undated sessions', () => {
    const s = [session('2026-10-06'), session('2026-10-08'), session('2026-10-01'), session('2026-10-20'), session(null)];
    expect(weeklyStreak(s, TODAY, 2)).toBe(1);
  });
});

describe('weeklyVolumeSeries', () => {
  it('returns one bucket per week, oldest first', () => {
    const s = [session('2026-10-13', [set('a', 50, 10)]), session('2026-10-12', [set('a', 10, 10)]), session('2026-10-05')];
    const series = weeklyVolumeSeries(s, TODAY, 3);
    expect(series.map((w) => w.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(series.map((w) => w.volumeKg)).toEqual([0, 500, 600]);
    expect(series.map((w) => w.sessions)).toEqual([0, 1, 2]);
  });
});

describe('personalRecords', () => {
  it('flags only improvements over the previous best e1RM, newest first', () => {
    const s = [
      session('2026-09-01', [set('bench', 50, 10)]),
      session('2026-09-08', [set('bench', 50, 8)]),
      session('2026-09-15', [set('bench', 52.5, 10), set('row', 60, 10)]),
      session('2026-09-22', [set('row', 65, 10), set('bench', 100, 20)]),
    ];
    const prs = personalRecords(s);
    expect(prs.map((p) => [p.exerciseId, p.date])).toEqual([
      ['row', '2026-09-22'],
      ['bench', '2026-09-15'],
    ]);
    expect(prs[1]!.weightKg).toBe(52.5);
    expect(prs[1]!.previousE1rm).toBeCloseTo(50 * (1 + 10 / 30));
  });

  it('ignores skipped sets', () => {
    const s = [session('2026-09-01', [set('a', 50, 10)]), session('2026-09-08', [set('a', 80, 10, true)])];
    expect(personalRecords(s)).toEqual([]);
  });
});

describe('trainedDays', () => {
  it('keeps dates inside the window only', () => {
    const s = [session('2026-10-14'), session('2026-07-17'), session('2026-07-16'), session('2026-10-15')];
    expect([...trainedDays(s, TODAY, 90)].sort()).toEqual(['2026-07-17', '2026-10-14']);
  });
});
