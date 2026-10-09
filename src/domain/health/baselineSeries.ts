import { addDays, type DateKey } from '../dates';
import { mean, previousValues, sd } from './baseline';
import type { DailyHealth } from './dailyMetrics';

type Field = 'hrvSDNN' | 'restingHR' | 'sleepHours' | 'steps' | 'bodyMassKg';

export interface SeriesPoint {
  date: DateKey;
  value?: number;
  /** Rolling baseline of the previous `window` days (excluding the day itself). */
  mean?: number;
  lo?: number;
  hi?: number;
}

/**
 * Daily values plus a rolling baseline band (mean ± 1 SD of the previous `window` days).
 * `logScale` computes the band on ln(value) and maps it back (HRV is log-normal; the recovery
 * engine also works on ln SDNN).
 */
export function seriesWithBaseline(
  history: ReadonlyArray<DailyHealth>,
  field: Field,
  from: DateKey,
  to: DateKey,
  opts: { window: number; minCount: number; logScale?: boolean },
): SeriesPoint[] {
  const byDate = new Map(history.map((d) => [d.date, d]));
  const out: SeriesPoint[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const value = byDate.get(k)?.[field];
    const prev = previousValues(history, field, k, opts.window).filter((v) => !opts.logScale || v > 0);
    const point: SeriesPoint = { date: k, value };
    if (prev.length >= opts.minCount) {
      const xs = opts.logScale ? prev.map(Math.log) : prev;
      const m = mean(xs)!;
      const s = sd(xs) ?? 0;
      const back = opts.logScale ? Math.exp : (x: number) => x;
      point.mean = back(m);
      point.lo = back(m - s);
      point.hi = back(m + s);
    }
    out.push(point);
  }
  return out;
}

/** Trailing moving average over `window` days (for the weight trend); needs at least one value. */
export function movingAverage(points: ReadonlyArray<SeriesPoint>, window: number): Array<number | undefined> {
  return points.map((_, i) => {
    const xs = points
      .slice(Math.max(0, i - window + 1), i + 1)
      .map((p) => p.value)
      .filter((v): v is number => v !== undefined);
    return mean(xs);
  });
}
