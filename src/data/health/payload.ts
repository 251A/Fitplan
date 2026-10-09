// Contract between the "FitPlan sync" shortcut (iOS Shortcuts) and the app.
// The shortcut runs with a Spanish locale, so the parser must tolerate decimal commas,
// numbers sent as text and Spanish names for sleep stages and workout types.

import type { HealthInput, TimedValue } from '../../domain/health/dailyMetrics';
import type { SleepInterval, SleepStage } from '../../domain/health/sleepAggregator';

export const HEALTH_PAYLOAD_VERSION = 1;

/** Daily totals (Shortcuts "Find Health Samples" grouped by day). */
export interface RawDailyValue {
  date: string; // ISO date or date-time
  value: number | string;
}

/** Individual samples with a timestamp. */
export interface RawSample {
  start: string; // ISO 8601
  end?: string;
  value: number | string;
  source?: string;
}

export interface RawWorkout {
  start: string;
  end: string;
  type: string; // "Carrera", "Running", "Natación en piscina", "Entrenamiento de fuerza"…
  source?: string;
  durationMin?: number | string;
  distanceM?: number | string;
  energyKcal?: number | string;
  avgHR?: number | string;
  maxHR?: number | string;
}

export interface RawHealthPayload {
  version: number;
  generatedAt?: string;
  steps?: RawDailyValue[];
  sleep?: Array<RawSample & { end: string; value: string }>;
  hrv?: RawSample[]; // ms (SDNN)
  restingHR?: RawSample[]; // bpm
  respiratoryRate?: RawSample[]; // breaths/min
  wristTemp?: RawSample[]; // °C (absolute; delta computed against own baseline)
  bodyMass?: RawSample[]; // kg
  workouts?: RawWorkout[];
}

export type WorkoutKind = 'run' | 'swim' | 'walk' | 'strength' | 'other';

export interface ParsedWorkout {
  startMs: number;
  endMs: number;
  kind: WorkoutKind;
  rawType: string;
  source?: string;
  durationMin: number;
  distanceM?: number;
  energyKcal?: number;
  avgHR?: number;
  maxHR?: number;
}

export interface ParsedHealthPayload extends HealthInput {
  generatedAtMs?: number;
  workouts: ParsedWorkout[];
  warnings: string[];
}

export class HealthPayloadError extends Error {}

/** Parses "62,5", "62.5", "1.234,5", "62 lpm", 62 → number. */
export function parseNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  let s = v.trim().replace(/[^\d.,-]/g, '');
  if (s === '' || s === '-') return undefined;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // The last separator is the decimal one; the other is thousands.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "15.400" in es_ES is fifteen thousand four hundred.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseTime(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const ms = Date.parse(v.trim());
  return Number.isNaN(ms) ? undefined : ms;
}

const SLEEP_STAGE_PATTERNS: Array<[RegExp, SleepStage]> = [
  [/en cama|in ?bed/i, 'inBed'],
  [/despiert|awake/i, 'awake'],
  [/profund|deep/i, 'deep'],
  [/rem/i, 'rem'],
  [/n[uú]cleo|ligero|core|light/i, 'core'],
  [/dormid|asleep|sue[nñ]o|unspecified|sin especificar/i, 'unspecified'],
];

export function parseSleepStage(v: string): SleepStage | undefined {
  for (const [re, stage] of SLEEP_STAGE_PATTERNS) if (re.test(v)) return stage;
  return undefined;
}

const WORKOUT_PATTERNS: Array<[RegExp, WorkoutKind]> = [
  [/nataci[oó]n|swim|piscina|pool|aguas abiertas/i, 'swim'],
  [/carrera|correr|running|run\b/i, 'run'],
  [/camina|walk|senderismo|hiking/i, 'walk'],
  [/fuerza|strength|pesas|weight|funcional/i, 'strength'],
];

export function parseWorkoutKind(type: string): WorkoutKind {
  for (const [re, kind] of WORKOUT_PATTERNS) if (re.test(type)) return kind;
  return 'other';
}

/**
 * Accepts individual samples ({start, value}) and daily aggregates ({date, value}, what Shortcuts
 * produces with "Agrupar por: Día"). Daily rows are placed at local noon of that day. A value of 0
 * means "no data that day" (Shortcuts fills missing days with 0), never a real HRV/HR/weight.
 */
function parseSamples(list: RawSample[] | undefined, name: string, warnings: string[]): TimedValue[] {
  const out: TimedValue[] = [];
  let bad = 0;
  for (const s of list ?? []) {
    const daily = (s as { date?: unknown }).date;
    const ms =
      parseTime(s.start) ??
      (typeof daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(daily.trim()) ? parseTime(`${daily.trim()}T12:00:00`) : undefined);
    const value = parseNumber(s.value);
    if (value === 0) continue;
    if (ms === undefined || value === undefined) {
      bad++;
      continue;
    }
    out.push({ ms, value, source: s.source });
  }
  if (bad > 0) warnings.push(`${bad} valores de ${name} no se pudieron leer.`);
  return out.sort((a, b) => a.ms - b.ms);
}

/** Bumped whenever parsing changes, so devices re-import payloads already on the server. */
export const PAYLOAD_PARSER_VERSION = 2;

const KNOWN_KEYS = [
  'version',
  'generatedAt',
  'steps',
  'sleep',
  'hrv',
  'restingHR',
  'respiratoryRate',
  'wristTemp',
  'bodyMass',
  'workouts',
] as const;

/** Top-level keys are matched case-insensitively ("restinghr" → "restingHR"): easy to mistype in Shortcuts. */
function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const byLower = new Map(KNOWN_KEYS.map((k) => [k.toLowerCase(), k]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[byLower.get(k.trim().toLowerCase()) ?? k] = v;
  return out;
}

export function parseHealthPayload(input: unknown): ParsedHealthPayload {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new HealthPayloadError('El texto pegado no es JSON válido. ¿Has ejecutado el atajo "FitPlan sync"?');
    }
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new HealthPayloadError('Formato de datos de Salud no reconocido.');
  }
  const p = normalizeKeys(raw as Record<string, unknown>) as unknown as RawHealthPayload;
  const version = parseNumber(p.version);
  if (version === undefined) {
    throw new HealthPayloadError('Faltan los datos de versión: el atajo no es "FitPlan sync".');
  }
  if (version > HEALTH_PAYLOAD_VERSION) {
    throw new HealthPayloadError('El atajo es más nuevo que la app. Actualiza la app.');
  }

  const warnings: string[] = [];

  const steps: ParsedHealthPayload['steps'] = [];
  for (const d of p.steps ?? []) {
    const value = parseNumber(d.value);
    const date = typeof d.date === 'string' ? d.date.trim().slice(0, 10) : '';
    if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    steps.push({ date, value: Math.round(value) });
  }

  const sleep: SleepInterval[] = [];
  const unknownStages = new Set<string>();
  for (const s of p.sleep ?? []) {
    const startMs = parseTime(s.start);
    const endMs = parseTime(s.end);
    const stage = typeof s.value === 'string' ? parseSleepStage(s.value) : undefined;
    if (startMs === undefined || endMs === undefined) continue;
    if (!stage) {
      unknownStages.add(String(s.value));
      continue;
    }
    sleep.push({ startMs, endMs, stage, source: s.source ?? 'Desconocido' });
  }
  if (unknownStages.size > 0) {
    warnings.push(`Fases de sueño no reconocidas: ${[...unknownStages].join(', ')}.`);
  }

  const workouts: ParsedWorkout[] = [];
  for (const w of p.workouts ?? []) {
    const startMs = parseTime(w.start);
    const endMs = parseTime(w.end);
    if (startMs === undefined || endMs === undefined || endMs <= startMs) continue;
    workouts.push({
      startMs,
      endMs,
      kind: parseWorkoutKind(w.type ?? ''),
      rawType: w.type ?? '',
      source: w.source,
      durationMin: parseNumber(w.durationMin) ?? (endMs - startMs) / 60_000,
      distanceM: parseNumber(w.distanceM),
      energyKcal: parseNumber(w.energyKcal),
      avgHR: parseNumber(w.avgHR),
      maxHR: parseNumber(w.maxHR),
    });
  }

  return {
    generatedAtMs: parseTime(p.generatedAt),
    steps,
    sleep,
    hrv: parseSamples(p.hrv, 'VFC', warnings),
    restingHR: parseSamples(p.restingHR, 'pulso en reposo', warnings),
    respiratoryRate: parseSamples(p.respiratoryRate, 'frecuencia respiratoria', warnings),
    wristTemp: parseSamples(p.wristTemp, 'temperatura de muñeca', warnings),
    bodyMass: parseSamples(p.bodyMass, 'peso', warnings),
    workouts: workouts.sort((a, b) => a.startMs - b.startMs),
    warnings,
  };
}
