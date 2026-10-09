import { addDays, type DateKey } from '../dates';
import type { DailyHealth } from './dailyMetrics';

type NumericField = 'steps' | 'sleepHours' | 'hrvSDNN' | 'restingHR' | 'respiratoryRate' | 'wristTemp' | 'bodyMassKg';

/** Values of a field in the `days` days before `date` (excluding `date`). */
export function previousValues(
  history: ReadonlyArray<DailyHealth>,
  field: NumericField,
  date: DateKey,
  days: number,
): number[] {
  const from = addDays(date, -days);
  return history
    .filter((d) => d.date >= from && d.date < date)
    .map((d) => d[field])
    .filter((v): v is number => typeof v === 'number');
}

export function mean(xs: ReadonlyArray<number>): number | undefined {
  return xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation. */
export function sd(xs: ReadonlyArray<number>): number | undefined {
  if (xs.length < 2) return undefined;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
