// Daily recovery state (spec section 5). Pure and deterministic: same history → same result.

import { addDays, formatDuration, type DateKey } from '../dates';
import { mean, previousValues, sd } from '../health/baseline';
import type { DailyHealth } from '../health/dailyMetrics';
import { DEFAULT_RECOVERY_CONFIG, type RecoveryConfig } from './recoveryConfig';

export type RecoveryState = 'green' | 'yellow' | 'red' | 'calibrating' | 'noData';

export type ConditionKind = 'hrv' | 'rhr' | 'sleep' | 'resp' | 'wristTemp' | 'acwr';

export interface RecoveryCondition {
  kind: ConditionKind;
  level: 'yellow' | 'red';
  reason: string;
}

export interface RecoveryMetrics {
  hrvZ?: number;
  hrvLn7?: number;
  hrvBaselineMs?: number; // exp(mean28 of ln SDNN), for display
  hrvCount7: number;
  hrvCount28: number;
  rhr?: number;
  rhrMean28?: number;
  rhrDelta?: number;
  sleepHours?: number;
  sleepMean14?: number;
  respDelta?: number;
  wristTempDelta?: number;
  acwr?: number;
}

export interface RecoveryResult {
  date: DateKey;
  state: RecoveryState;
  conditions: RecoveryCondition[];
  /** Human readable, Spanish. Always at least one line. */
  reasons: string[];
  metrics: RecoveryMetrics;
}

const n1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n1s = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'always' });
const n0s = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, signDisplay: 'always' });

function windowValues(history: ReadonlyArray<DailyHealth>, field: 'hrvSDNN', date: DateKey, days: number): number[] {
  // Inclusive of `date`.
  return previousValues(history, field, addDays(date, 1), days);
}

export function evaluateRecovery(
  history: ReadonlyArray<DailyHealth>,
  date: DateKey,
  opts: { config?: RecoveryConfig; acwr?: number } = {},
): RecoveryResult {
  const cfg = opts.config ?? DEFAULT_RECOVERY_CONFIG;
  const today = history.find((d) => d.date === date);
  const conditions: RecoveryCondition[] = [];
  const notes: string[] = [];

  // --- HRV -----------------------------------------------------------------
  const ln7 = windowValues(history, 'hrvSDNN', date, 7).filter((v) => v > 0).map(Math.log);
  const ln28 = windowValues(history, 'hrvSDNN', date, 28).filter((v) => v > 0).map(Math.log);
  const metrics: RecoveryMetrics = { hrvCount7: ln7.length, hrvCount28: ln28.length, acwr: opts.acwr };
  const hrvReady = ln7.length >= cfg.hrvMin7 && ln28.length >= cfg.hrvMin28;
  if (hrvReady) {
    const m28 = mean(ln28)!;
    const s28 = sd(ln28)!;
    metrics.hrvLn7 = mean(ln7)!;
    metrics.hrvBaselineMs = Math.exp(m28);
    if (s28 > 0) {
      const z = (metrics.hrvLn7 - m28) / s28;
      metrics.hrvZ = z;
      if (z < cfg.hrvZRed) {
        conditions.push({ kind: 'hrv', level: 'red', reason: `VFC muy por debajo de tu línea base (z ${n1.format(z)}).` });
      } else if (z < cfg.hrvZYellow) {
        conditions.push({ kind: 'hrv', level: 'yellow', reason: `VFC por debajo de tu línea base (z ${n1.format(z)}).` });
      }
    }
  } else {
    notes.push(`VFC calibrando: ${ln28.length}/${cfg.hrvMin28} días de línea base.`);
  }

  // --- Resting HR ----------------------------------------------------------
  const rhrPrev = previousValues(history, 'restingHR', date, 28);
  const rhrReady = rhrPrev.length >= cfg.rhrMin28;
  if (today?.restingHR !== undefined) metrics.rhr = today.restingHR;
  if (rhrReady && today?.restingHR !== undefined) {
    const m = mean(rhrPrev)!;
    const delta = today.restingHR - m;
    metrics.rhrMean28 = m;
    metrics.rhrDelta = delta;
    const text = `Pulso en reposo ${today.restingHR} lpm, ${n0s.format(delta)} sobre tu media (${Math.round(m)}).`;
    if (delta >= cfg.rhrDeltaRed) conditions.push({ kind: 'rhr', level: 'red', reason: text });
    else if (delta >= cfg.rhrDeltaYellow) conditions.push({ kind: 'rhr', level: 'yellow', reason: text });
  } else if (!rhrReady) {
    notes.push(`Pulso en reposo calibrando: ${rhrPrev.length}/${cfg.rhrMin28} días.`);
  }

  // --- Sleep (absolute rules work without a baseline) ----------------------
  const sleepPrev = previousValues(history, 'sleepHours', date, 14);
  const sleepMean = sleepPrev.length >= cfg.sleepMin14 ? mean(sleepPrev) : undefined;
  metrics.sleepMean14 = sleepMean;
  if (today?.sleepHours !== undefined) {
    const h = today.sleepHours;
    metrics.sleepHours = h;
    const below = sleepMean !== undefined ? sleepMean - h : undefined;
    const vsMean =
      below !== undefined && below > 0 ? `, ${formatDuration(below)} menos que tu media` : '';
    if (h < cfg.sleepRed) {
      conditions.push({ kind: 'sleep', level: 'red', reason: `Dormiste ${formatDuration(h)}${vsMean}.` });
    } else if (h < cfg.sleepYellow || (below !== undefined && below > cfg.sleepBelowMeanYellow)) {
      conditions.push({ kind: 'sleep', level: 'yellow', reason: `Dormiste ${formatDuration(h)}${vsMean}.` });
    }
  }

  // --- Respiratory rate & wrist temperature (warnings) --------------------
  const respPrev = previousValues(history, 'respiratoryRate', date, 28);
  if (today?.respiratoryRate !== undefined && respPrev.length >= cfg.rhrMin28) {
    const delta = today.respiratoryRate - mean(respPrev)!;
    metrics.respDelta = delta;
    if (delta >= cfg.respDeltaYellow) {
      conditions.push({
        kind: 'resp',
        level: 'yellow',
        reason: `Frecuencia respiratoria ${n1s.format(delta)} sobre tu media.`,
      });
    }
  }
  const tempPrev = previousValues(history, 'wristTemp', date, 28);
  if (today?.wristTemp !== undefined && tempPrev.length >= cfg.rhrMin28) {
    const delta = today.wristTemp - mean(tempPrev)!;
    metrics.wristTempDelta = delta;
    if (delta >= cfg.wristTempDeltaYellow) {
      conditions.push({
        kind: 'wristTemp',
        level: 'yellow',
        reason: `Temperatura de muñeca ${n1s.format(delta)} °C sobre tu media.`,
      });
    }
  }

  // --- Training load -------------------------------------------------------
  if (opts.acwr !== undefined && opts.acwr > cfg.acwrYellow) {
    conditions.push({
      kind: 'acwr',
      level: 'yellow',
      reason: `Carga de los últimos 7 días alta respecto a tu media (ACWR ${n1.format(opts.acwr)}).`,
    });
  }

  // --- State ---------------------------------------------------------------
  const hasToday =
    today !== undefined &&
    (today.sleepHours !== undefined || today.hrvSDNN !== undefined || today.restingHR !== undefined);

  let state: RecoveryState;
  if (!hasToday) state = 'noData';
  else if (conditions.some((c) => c.level === 'red') || conditions.length >= cfg.yellowCountRed) state = 'red';
  else if (conditions.length > 0) state = 'yellow';
  else if (!hrvReady && !rhrReady) state = 'calibrating';
  else state = 'green';

  const reasons = conditions.map((c) => c.reason);
  if (state === 'red' && !conditions.some((c) => c.level === 'red')) {
    reasons.unshift(`${conditions.length} señales de fatiga a la vez.`);
  }
  if (state === 'noData') reasons.push('Aún no hay datos de Salud de hoy. Ejecuta el atajo o sincroniza.');
  if (state === 'green') reasons.push('Sueño, VFC y pulso en reposo dentro de tu rango habitual.');
  if (state === 'calibrating') reasons.push('Se necesitan unas semanas de datos para calcular tus líneas base.');
  reasons.push(...notes);

  return { date, state, conditions, reasons, metrics };
}

/** What the day's plan should do with the state (spec section 5, "Efecto en el plan del día"). */
export function planAdvice(state: RecoveryState): string {
  switch (state) {
    case 'green':
      return 'Sesión tal cual.';
    case 'yellow':
      return 'Gimnasio con 1 repetición más en reserva (RIR +1) y una serie menos por ejercicio. Cardio solo suave (Z2).';
    case 'red':
      return 'Mueve el gimnasio a otro día si hay hueco; si no, sesión ligera (2 series, RIR 3) o descanso. Cardio: paseo o natación muy suave.';
    case 'calibrating':
    case 'noData':
      return 'Sin ajuste: planifica normal.';
  }
}
