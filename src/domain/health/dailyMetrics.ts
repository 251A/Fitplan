import { dateKey, DEFAULT_TIME_ZONE, type DateKey } from '../dates';
import { aggregateSleep, type NightSleep, type SleepInterval } from './sleepAggregator';

export interface TimedValue {
  ms: number;
  value: number;
  source?: string;
}

export interface HealthInput {
  steps: Array<{ date: DateKey; value: number }>;
  sleep: SleepInterval[];
  hrv: TimedValue[];
  restingHR: TimedValue[];
  respiratoryRate: TimedValue[];
  wristTemp: TimedValue[];
  bodyMass: TimedValue[];
}

/** One row per calendar day. Recovery fields are filled later by the recovery engine. */
export interface DailyHealth {
  date: DateKey;
  steps?: number;
  sleepHours?: number;
  sleepStages?: NightSleep['stageHours'];
  /** Mean SDNN (ms) during the night's sleep window, or of the whole day as fallback. */
  hrvSDNN?: number;
  hrvFromNight?: boolean;
  restingHR?: number;
  respiratoryRate?: number;
  /** Absolute nightly wrist temperature (°C); the delta is computed against the baseline. */
  wristTemp?: number;
  bodyMassKg?: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x: number, digits = 1) => Math.round(x * 10 ** digits) / 10 ** digits;

function groupByDay(values: TimedValue[], timeZone: string): Map<DateKey, TimedValue[]> {
  const out = new Map<DateKey, TimedValue[]>();
  for (const v of values) {
    const k = dateKey(v.ms, timeZone);
    const list = out.get(k) ?? [];
    list.push(v);
    out.set(k, list);
  }
  return out;
}

export function buildDailyHealth(input: HealthInput, timeZone: string = DEFAULT_TIME_ZONE): DailyHealth[] {
  const days = new Map<DateKey, DailyHealth>();
  const day = (k: DateKey) => {
    let d = days.get(k);
    if (!d) {
      d = { date: k };
      days.set(k, d);
    }
    return d;
  };

  for (const s of input.steps) {
    // If the shortcut sends several rows for one day (e.g. per source), keep the largest:
    // Shortcuts already de-duplicates iPhone + Watch when grouping by day.
    const d = day(s.date);
    d.steps = Math.max(d.steps ?? 0, s.value);
  }

  const nights = aggregateSleep(input.sleep, timeZone);
  const nightByDate = new Map(nights.map((n) => [n.date, n]));
  for (const n of nights) {
    const d = day(n.date);
    d.sleepHours = round(n.hours, 2);
    d.sleepStages = n.stageHours;
  }

  // HRV: mean of the readings inside the sleep window, assigned to the wake-up day
  // (readings before midnight included). Days without night readings fall back to their
  // daytime readings.
  const inSomeNight = (ms: number) => nights.some((n) => ms >= n.windowStartMs && ms <= n.windowEndMs);
  for (const night of nights) {
    const inNight = input.hrv.filter((v) => v.ms >= night.windowStartMs && v.ms <= night.windowEndMs);
    if (inNight.length === 0) continue;
    const d = day(night.date);
    d.hrvSDNN = round(mean(inNight.map((v) => v.value)));
    d.hrvFromNight = true;
  }
  for (const [k, values] of groupByDay(input.hrv, timeZone)) {
    if (nightByDate.has(k) && days.get(k)?.hrvFromNight) continue;
    const daytime = values.filter((v) => !inSomeNight(v.ms));
    if (daytime.length === 0) continue;
    const d = day(k);
    d.hrvSDNN = round(mean(daytime.map((v) => v.value)));
    d.hrvFromNight = false;
  }

  // Resting HR is already a daily value in Health; take the last one of the day.
  for (const [k, values] of groupByDay(input.restingHR, timeZone)) {
    day(k).restingHR = Math.round(values[values.length - 1]!.value);
  }
  for (const [k, values] of groupByDay(input.respiratoryRate, timeZone)) {
    day(k).respiratoryRate = round(mean(values.map((v) => v.value)));
  }
  for (const [k, values] of groupByDay(input.wristTemp, timeZone)) {
    day(k).wristTemp = round(mean(values.map((v) => v.value)), 2);
  }
  for (const [k, values] of groupByDay(input.bodyMass, timeZone)) {
    day(k).bodyMassKg = round(values[values.length - 1]!.value);
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
