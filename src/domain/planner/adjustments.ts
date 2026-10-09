// In-week changes (spec 6 "Reajuste durante la semana" and spec 5 "Efecto en el plan del día").

import type { RecoveryState } from '../recovery/recoveryEngine';
import { addDays, isoWeekday, type DateKey } from '../dates';
import { TEMPLATES, trainsLegs } from './gymTemplates';
import { dayName, label, type DayAvailability, type PlannedSession, type WeekPlan } from './weekPlanner';

const dist = (a: DateKey, b: DateKey) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Whether `s` could take place on `date` given the rest of the plan (same rules as the planner). */
export function canPlace(plan: WeekPlan, s: PlannedSession, date: DateKey): boolean {
  const avail: DayAvailability | undefined = plan.availability.find((a) => a.weekday === isoWeekday(date));
  const activity = s.kind === 'gym' || s.kind === 'run' || s.kind === 'swim' ? s.kind : undefined;
  if (!activity || !avail?.allowed.includes(activity)) return false;
  if (avail.maxMinutes !== undefined && s.minutes > avail.maxMinutes) return false;
  // Every other session that still happens (planned, moved, downgraded or done) occupies its day.
  const active = plan.sessions.filter((x) => x.id !== s.id && x.status !== 'skipped');
  if (active.some((x) => x.date === date)) return false;
  if (s.kind === 'gym' && s.gymTemplate) {
    const groups = TEMPLATES[s.gymTemplate].groups;
    if (active.some((x) => x.gymTemplate && dist(x.date, date) === 1 && TEMPLATES[x.gymTemplate].groups.some((g) => groups.includes(g)))) return false;
    if (trainsLegs(s.gymTemplate) && active.some((x) => x.kind === 'run' && x.intensity === 'hard' && dist(x.date, date) === 1)) return false;
  }
  if (s.kind === 'run' && s.intensity === 'hard') {
    if (active.some((x) => x.gymTemplate && trainsLegs(x.gymTemplate) && dist(x.date, date) === 1)) return false;
  }
  return true;
}

export interface MoveResult {
  plan: WeekPlan;
  message: string;
}

/**
 * A planned session was not done: move it to the next available day that keeps the rules; if none,
 * drop the lowest-priority session (swim < easy run < upper-body gym < legs).
 */
export function rescheduleMissed(plan: WeekPlan, sessionId: string, fromDate: DateKey, reason: string, now = Date.now()): MoveResult {
  const next: WeekPlan = structuredClone(plan);
  const s = next.sessions.find((x) => x.id === sessionId);
  if (!s) return { plan, message: 'Sesión no encontrada.' };
  const weekEnd = addDays(next.weekStart, 6);
  const originalDay = dayName(s.date);

  for (let d = addDays(fromDate, 1); d <= weekEnd; d = addDays(d, 1)) {
    if (canPlace(next, s, d)) {
      s.date = d;
      s.status = 'moved';
      s.rationale.push(`Movida al ${dayName(d)} porque el ${originalDay} ${reason}.`);
      next.sessions.sort((a, b) => a.date.localeCompare(b.date));
      next.updatedAt = now;
      return { plan: next, message: `${capitalize(label(s))} pasa al ${dayName(d)}.` };
    }
  }

  // No free day: replace a later, less important session if it keeps the rules.
  const later = next.sessions
    .filter((x) => x.id !== s.id && x.date > fromDate && x.status === 'planned' && x.priority < s.priority)
    .sort((a, b) => a.priority - b.priority);
  for (const victim of later) {
    victim.status = 'skipped';
    if (canPlace(next, s, victim.date)) {
      victim.rationale.push(`Descartada para hacer ${label(s)}, que es más importante.`);
      s.date = victim.date;
      s.status = 'moved';
      s.rationale.push(`Movida al ${dayName(victim.date)} en lugar de ${label(victim)} porque el ${originalDay} ${reason}.`);
      next.sessions.sort((a, b) => a.date.localeCompare(b.date));
      next.updatedAt = now;
      return { plan: next, message: `${capitalize(label(s))} pasa al ${dayName(victim.date)}; se descarta ${label(victim)}.` };
    }
    victim.status = 'planned';
  }

  s.status = 'skipped';
  s.rationale.push(`Descartada: el ${originalDay} ${reason} y no cabe en otro día de la semana.`);
  next.updatedAt = now;
  return { plan: next, message: `${capitalize(label(s))} no cabe en otro día: queda descartada esta semana.` };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type DayAction = 'asPlanned' | 'downgrade' | 'moveOrLight' | 'activeRecovery' | 'none';

export interface AdjustedSession {
  session: PlannedSession;
  action: DayAction;
  /** What to do today, in Spanish. */
  advice: string;
  /** Gym tweaks for yellow/red days. */
  rirDelta: number;
  setsDelta: number;
  /** For red gym days: suggested day to move to (if any). */
  moveTo?: DateKey;
}

/** Applies the recovery state to today's session (spec 5). Pure: the user decides whether to move. */
export function adjustForRecovery(plan: WeekPlan, s: PlannedSession, state: RecoveryState): AdjustedSession {
  const base = { session: s, rirDelta: 0, setsDelta: 0 };
  if (state === 'green' || state === 'calibrating' || state === 'noData') {
    return { ...base, action: 'asPlanned', advice: state === 'green' ? 'Sesión tal cual.' : 'Sin ajuste por recuperación.' };
  }
  if (state === 'yellow') {
    if (s.kind === 'gym') {
      return { ...base, action: 'downgrade', rirDelta: 1, setsDelta: -1, advice: 'Amarillo: deja 1 repetición más en reserva y haz una serie menos por ejercicio.' };
    }
    return {
      ...base,
      action: 'downgrade',
      advice: s.intensity === 'hard' ? 'Amarillo: hazla en suave (Z2), sin apretar.' : 'Amarillo: solo suave, en Z2.',
    };
  }
  // red
  if (s.kind === 'gym') {
    let moveTo: DateKey | undefined;
    for (let d = addDays(s.date, 1); d <= addDays(plan.weekStart, 6); d = addDays(d, 1)) {
      if (canPlace(plan, s, d)) {
        moveTo = d;
        break;
      }
    }
    return {
      ...base,
      action: 'moveOrLight',
      moveTo,
      rirDelta: 3,
      setsDelta: -99,
      advice: moveTo
        ? `Rojo: mejor muévela al ${dayName(moveTo)}. Si vas igualmente, sesión ligera: 2 series por ejercicio con 3 repeticiones en reserva.`
        : 'Rojo: no hay otro día libre. Sesión ligera (2 series por ejercicio, 3 repeticiones en reserva) o descanso.',
    };
  }
  return {
    ...base,
    action: 'activeRecovery',
    advice: s.kind === 'swim' ? 'Rojo: natación muy suave y corta, o descanso.' : 'Rojo: cambia la carrera por un paseo de 30–40 min, o descansa.',
  };
}

/** Sets to do today for a template exercise after deload/short-version and recovery tweaks. */
export function adjustedSets(baseSets: number, setsFactor: number | undefined, setsDelta: number): number {
  const planned = Math.max(1, Math.round(baseSets * (setsFactor ?? 1)));
  if (setsDelta <= -99) return Math.min(2, planned);
  return Math.max(1, planned + setsDelta);
}
