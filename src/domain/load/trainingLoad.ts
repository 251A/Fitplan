// Training load (spec section 8, "Carga de entrenamiento").
// With heart rate: Edwards TRIMP approximated from the session's average HR zone × minutes.
// Without heart rate: sRPE = effort (default 7 for gym, 5 for cardio) × minutes.

import { addDays, dateKey, DEFAULT_TIME_ZONE, type DateKey } from '../dates';

export interface LoadSession {
  startMs: number;
  durationMin: number;
  kind: 'run' | 'swim' | 'walk' | 'strength' | 'other';
  avgHR?: number;
  /** Session RPE 1–10 if the user answered the quick question. */
  rpe?: number;
}

/** Edwards zone weight (1–5) for an average HR as % of HRmax. */
export function edwardsZone(avgHR: number, hrMax: number): number {
  const pct = avgHR / hrMax;
  if (pct >= 0.9) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.7) return 3;
  if (pct >= 0.6) return 2;
  if (pct >= 0.5) return 1;
  return 0;
}

const DEFAULT_RPE: Record<LoadSession['kind'], number> = { strength: 7, run: 5, swim: 5, walk: 2, other: 4 };

/**
 * Load in arbitrary units. TRIMP (zone × min) and sRPE (RPE × min) have different scales, so
 * TRIMP is multiplied by 2 to sit in the same range (zone 3 × 2 ≈ RPE 6) and keep ACWR consistent
 * when a week mixes sessions with and without heart rate.
 */
export function sessionLoad(s: LoadSession, hrMax?: number): number {
  if (s.rpe === undefined && s.avgHR !== undefined && hrMax) {
    return edwardsZone(s.avgHR, hrMax) * 2 * s.durationMin;
  }
  return (s.rpe ?? DEFAULT_RPE[s.kind]) * s.durationMin;
}

export function dailyLoads(
  sessions: ReadonlyArray<LoadSession>,
  hrMax?: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): Map<DateKey, number> {
  const out = new Map<DateKey, number>();
  for (const s of sessions) {
    if (s.kind === 'walk') continue; // daily walking is covered by the step goal
    const k = dateKey(s.startMs, timeZone);
    out.set(k, (out.get(k) ?? 0) + sessionLoad(s, hrMax));
  }
  return out;
}

/**
 * Acute:chronic workload ratio = load of the last 7 days / (load of the last 28 days / 4).
 * Undefined until there are 28 days of history or when the chronic load is zero.
 */
export function acwr(loads: Map<DateKey, number>, date: DateKey, firstDataDate?: DateKey): number | undefined {
  if (!firstDataDate || firstDataDate > addDays(date, -27)) return undefined;
  let acute = 0;
  let chronic = 0;
  for (let i = 0; i < 28; i++) {
    const v = loads.get(addDays(date, -i)) ?? 0;
    chronic += v;
    if (i < 7) acute += v;
  }
  if (chronic === 0) return undefined;
  return acute / (chronic / 4);
}
