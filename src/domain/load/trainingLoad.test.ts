import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { acwr, dailyLoads, edwardsZone, sessionLoad } from './trainingLoad';

describe('training load', () => {
  it('maps average HR to Edwards zones', () => {
    expect(edwardsZone(89, 179)).toBe(0); // < 50 %
    expect(edwardsZone(119, 179)).toBe(2); // 66 %
    expect(edwardsZone(148, 179)).toBe(4); // 83 %
    expect(edwardsZone(170, 179)).toBe(5);
  });

  it('uses TRIMP with HR, sRPE otherwise (gym default 7)', () => {
    expect(sessionLoad({ startMs: 0, durationMin: 50, kind: 'strength' })).toBe(350);
    expect(sessionLoad({ startMs: 0, durationMin: 30, kind: 'run', avgHR: 148 }, 179)).toBe(240);
    expect(sessionLoad({ startMs: 0, durationMin: 30, kind: 'run', avgHR: 148, rpe: 6 }, 179)).toBe(180);
  });

  it('ignores walks in daily load', () => {
    const t = Date.parse('2026-10-08T18:00:00+02:00');
    const loads = dailyLoads([{ startMs: t, durationMin: 60, kind: 'walk' }], 179, 'Europe/Madrid');
    expect(loads.size).toBe(0);
  });

  it('computes ACWR only with 28 days of history', () => {
    const date = '2026-10-09';
    const loads = new Map<string, number>();
    for (let i = 0; i < 28; i++) loads.set(addDays(date, -i), i < 7 ? 200 : 100);
    // acute 1400, chronic (1400 + 2100) / 4 = 875 → 1.6
    expect(acwr(loads, date, addDays(date, -27))).toBeCloseTo(1.6, 5);
    expect(acwr(loads, date, addDays(date, -20))).toBeUndefined();
    expect(acwr(new Map(), date, addDays(date, -40))).toBeUndefined();
  });
});
