import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { DailyHealth } from './dailyMetrics';
import { movingAverage, seriesWithBaseline } from './baselineSeries';

const days: DailyHealth[] = Array.from({ length: 10 }, (_, i) => ({
  date: addDays('2026-10-01', i),
  restingHR: i % 2 ? 60 : 64,
  hrvSDNN: i % 2 ? 50 : 80,
}));

describe('seriesWithBaseline', () => {
  it('uses only previous days and needs minCount values', () => {
    const s = seriesWithBaseline(days, 'restingHR', '2026-10-01', '2026-10-10', { window: 28, minCount: 4 });
    expect(s).toHaveLength(10);
    expect(s[3]?.mean).toBeUndefined(); // only 3 previous days
    expect(s[4]?.mean).toBe(62);
    expect(s[4]?.lo).toBeLessThan(62);
    expect(s[4]?.hi).toBeGreaterThan(62);
    expect(s[4]?.value).toBe(64);
  });

  it('computes the band in log space for HRV (geometric mean)', () => {
    const s = seriesWithBaseline(days, 'hrvSDNN', '2026-10-05', '2026-10-05', {
      window: 28,
      minCount: 4,
      logScale: true,
    });
    expect(s[0]?.mean).toBeCloseTo(Math.sqrt(50 * 80), 5);
  });

  it('fills missing days with undefined values', () => {
    const s = seriesWithBaseline(days, 'steps', '2026-10-01', '2026-10-02', { window: 7, minCount: 1 });
    expect(s.map((p) => p.value)).toEqual([undefined, undefined]);
  });
});

describe('movingAverage', () => {
  it('averages the available values in the trailing window', () => {
    const pts = [{ date: 'a', value: 70 }, { date: 'b' }, { date: 'c', value: 72 }];
    expect(movingAverage(pts, 2)).toEqual([70, 70, 72]);
    expect(movingAverage(pts, 3)[2]).toBe(71);
  });
});
