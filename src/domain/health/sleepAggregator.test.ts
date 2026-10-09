import { describe, expect, it } from 'vitest';
import { aggregateSleep, unionDurationMs, type SleepInterval } from './sleepAggregator';

const t = (iso: string) => Date.parse(iso);
const iv = (start: string, end: string, stage: SleepInterval['stage'], source: string): SleepInterval => ({
  startMs: t(start),
  endMs: t(end),
  stage,
  source,
});

describe('unionDurationMs', () => {
  it('merges overlapping and touching intervals', () => {
    const h = 3600_000;
    expect(
      unionDurationMs([
        { startMs: 0, endMs: 2 * h },
        { startMs: 1 * h, endMs: 3 * h },
        { startMs: 3 * h, endMs: 4 * h },
        { startMs: 6 * h, endMs: 7 * h },
      ]),
    ).toBe(5 * h);
  });

  it('ignores empty or inverted intervals', () => {
    expect(unionDurationMs([{ startMs: 10, endMs: 10 }, { startMs: 20, endMs: 5 }])).toBe(0);
  });
});

describe('aggregateSleep', () => {
  it('does not double count iPhone + Watch overlap (the 13 h bug)', () => {
    const samples = [
      // iPhone: one long unspecified block 23:00 → 07:00
      iv('2026-10-07T23:00:00+02:00', '2026-10-08T07:00:00+02:00', 'unspecified', 'iPhone de Ana'),
      // Watch: staged samples 23:30 → 07:00 with a short awake gap
      iv('2026-10-07T23:30:00+02:00', '2026-10-08T02:00:00+02:00', 'core', 'Apple Watch de Ana'),
      iv('2026-10-08T02:00:00+02:00', '2026-10-08T03:00:00+02:00', 'deep', 'Apple Watch de Ana'),
      iv('2026-10-08T03:00:00+02:00', '2026-10-08T03:10:00+02:00', 'awake', 'Apple Watch de Ana'),
      iv('2026-10-08T03:10:00+02:00', '2026-10-08T05:00:00+02:00', 'rem', 'Apple Watch de Ana'),
      iv('2026-10-08T05:00:00+02:00', '2026-10-08T07:00:00+02:00', 'core', 'Apple Watch de Ana'),
      // Watch also writes an in-bed block that must be ignored
      iv('2026-10-07T23:00:00+02:00', '2026-10-08T07:05:00+02:00', 'inBed', 'Apple Watch de Ana'),
    ];
    const [night] = aggregateSleep(samples);
    expect(night?.date).toBe('2026-10-08');
    expect(night?.hours).toBeCloseTo(7 + 20 / 60, 5); // 7.5 h minus 10 min awake
    expect(night?.sources).toEqual(['Apple Watch de Ana']);
    expect(night?.stageHours.deep).toBeCloseTo(1, 5);
    expect(night?.stageHours.rem).toBeCloseTo(110 / 60, 5);
  });

  it('merges overlapping samples from the same source', () => {
    const samples = [
      iv('2026-10-07T23:00:00+02:00', '2026-10-08T04:00:00+02:00', 'core', 'Apple Watch'),
      iv('2026-10-08T03:00:00+02:00', '2026-10-08T07:00:00+02:00', 'core', 'Apple Watch'),
    ];
    expect(aggregateSleep(samples)[0]?.hours).toBeCloseTo(8, 5);
  });

  it('falls back to the union of all sources when there is no Watch data', () => {
    const samples = [
      iv('2026-10-07T23:00:00+02:00', '2026-10-08T05:00:00+02:00', 'unspecified', 'iPhone'),
      iv('2026-10-08T04:00:00+02:00', '2026-10-08T07:00:00+02:00', 'unspecified', 'AutoSleep'),
    ];
    const [night] = aggregateSleep(samples);
    expect(night?.hours).toBeCloseTo(8, 5);
    expect(night?.sources).toEqual(['AutoSleep', 'iPhone']);
  });

  it('assigns each night to its wake-up date, including late-evening sleep', () => {
    const samples = [
      iv('2026-10-06T22:00:00+02:00', '2026-10-06T23:30:00+02:00', 'core', 'Apple Watch'),
      iv('2026-10-06T23:30:00+02:00', '2026-10-07T06:30:00+02:00', 'core', 'Apple Watch'),
      iv('2026-10-07T23:00:00+02:00', '2026-10-08T06:00:00+02:00', 'core', 'Apple Watch'),
    ];
    const nights = aggregateSleep(samples);
    expect(nights.map((n) => n.date)).toEqual(['2026-10-07', '2026-10-08']);
    expect(nights[0]?.hours).toBeCloseTo(8.5, 5);
    expect(nights[1]?.hours).toBeCloseTo(7, 5);
  });
});
