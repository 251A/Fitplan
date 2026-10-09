import { dateKey, DEFAULT_TIME_ZONE, type DateKey } from '../dates';

export type SleepStage = 'core' | 'deep' | 'rem' | 'unspecified' | 'inBed' | 'awake';

export interface SleepInterval {
  startMs: number;
  endMs: number;
  stage: SleepStage;
  source: string;
}

export interface NightSleep {
  /** Night is assigned to the wake-up date. */
  date: DateKey;
  hours: number;
  /** Sources used after prioritisation (Watch wins when present). */
  sources: string[];
  stageHours: Partial<Record<'core' | 'deep' | 'rem' | 'unspecified', number>>;
  /** First asleep start and last asleep end of the night (used for nightly HRV). */
  windowStartMs: number;
  windowEndMs: number;
}

const ASLEEP: ReadonlySet<SleepStage> = new Set(['core', 'deep', 'rem', 'unspecified']);

// Intervals ending after 18:00 belong to the next day's wake-up date.
const NIGHT_SHIFT_MS = 6 * 3600_000;

export function isWatchSource(source: string): boolean {
  return /watch/i.test(source);
}

/** Union of intervals; returns total covered milliseconds. */
export function unionDurationMs(intervals: ReadonlyArray<{ startMs: number; endMs: number }>): number {
  const sorted = intervals
    .filter((i) => i.endMs > i.startMs)
    .map((i) => [i.startMs, i.endMs] as const)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of sorted) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/**
 * Aggregates raw sleep samples (iPhone + Watch overlap!) into hours per night.
 * 1. Keep only asleep stages. 2. Per night, use Watch samples if any exist, otherwise all
 * sources. 3. Merge overlapping intervals (union) so nothing is counted twice.
 */
export function aggregateSleep(
  samples: ReadonlyArray<SleepInterval>,
  timeZone: string = DEFAULT_TIME_ZONE,
): NightSleep[] {
  const byNight = new Map<DateKey, SleepInterval[]>();
  for (const s of samples) {
    if (!ASLEEP.has(s.stage) || s.endMs <= s.startMs) continue;
    const night = dateKey(s.endMs + NIGHT_SHIFT_MS, timeZone);
    const list = byNight.get(night) ?? [];
    list.push(s);
    byNight.set(night, list);
  }

  const nights: NightSleep[] = [];
  for (const [date, all] of byNight) {
    const watch = all.filter((s) => isWatchSource(s.source));
    const chosen = watch.length > 0 ? watch : all;
    const stageHours: NightSleep['stageHours'] = {};
    for (const stage of ['core', 'deep', 'rem', 'unspecified'] as const) {
      const ms = unionDurationMs(chosen.filter((s) => s.stage === stage));
      if (ms > 0) stageHours[stage] = ms / 3600_000;
    }
    nights.push({
      date,
      hours: unionDurationMs(chosen) / 3600_000,
      sources: [...new Set(chosen.map((s) => s.source))].sort(),
      stageHours,
      windowStartMs: Math.min(...chosen.map((s) => s.startMs)),
      windowEndMs: Math.max(...chosen.map((s) => s.endMs)),
    });
  }
  return nights.sort((a, b) => a.date.localeCompare(b.date));
}
