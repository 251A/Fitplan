// Planned vs done for a week, plus the week's health picture (spec phase 5).

import { addDays, type DateKey } from '../dates';
import type { DailyHealth } from '../health/dailyMetrics';
import type { Activity, WeekPlan } from './weekPlanner';

export interface KindCount {
  planned: number;
  done: number;
}

export interface WeeklySummary {
  weekStart: DateKey;
  byKind: Record<Activity, KindCount>;
  /** Done gym sessions in the app/imports (may exceed the plan if extra sessions were logged). */
  gymLogged: number;
  stepDays: { met: number; withData: number };
  avgSteps?: number;
  avgSleepHours?: number;
  weightChangeKg?: number;
  /** Short Spanish lines for display. */
  lines: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function weeklySummary(
  plan: WeekPlan,
  days: ReadonlyArray<DailyHealth>,
  gymSessionDates: ReadonlyArray<DateKey>,
  until?: DateKey,
): WeeklySummary {
  const end = until && until < addDays(plan.weekStart, 6) ? until : addDays(plan.weekStart, 6);
  const inWeek = (d: DateKey) => d >= plan.weekStart && d <= end;
  const byKind: Record<Activity, KindCount> = { gym: { planned: 0, done: 0 }, run: { planned: 0, done: 0 }, swim: { planned: 0, done: 0 } };
  // Planned counts the whole week; done counts what happened up to `until`.
  for (const s of plan.sessions) {
    if ((s.kind !== 'gym' && s.kind !== 'run' && s.kind !== 'swim') || s.status === 'skipped') continue;
    byKind[s.kind].planned++;
    if (s.status === 'done' && inWeek(s.date)) byKind[s.kind].done++;
  }
  const week = days.filter((d) => inWeek(d.date));
  const withSteps = week.filter((d) => d.steps !== undefined);
  const met = withSteps.filter((d) => d.steps! >= (plan.stepTargets[d.date] ?? 10000)).length;
  const weights = days.filter((d) => d.bodyMassKg !== undefined && d.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const before = [...weights].reverse().find((d) => d.date < plan.weekStart);
  const last = [...weights].reverse().find((d) => inWeek(d.date));
  const gymLogged = new Set(gymSessionDates.filter(inWeek)).size;

  const s: WeeklySummary = {
    weekStart: plan.weekStart,
    byKind,
    gymLogged,
    stepDays: { met, withData: withSteps.length },
    avgSteps: mean(withSteps.map((d) => d.steps!)),
    avgSleepHours: mean(week.filter((d) => d.sleepHours !== undefined).map((d) => d.sleepHours!)),
    weightChangeKg: before?.bodyMassKg !== undefined && last?.bodyMassKg !== undefined ? last.bodyMassKg - before.bodyMassKg : undefined,
    lines: [],
  };

  const gymDone = Math.max(byKind.gym.done, gymLogged);
  s.lines.push(`Gimnasio: ${gymDone} de ${byKind.gym.planned} sesiones.`);
  if (byKind.run.planned || byKind.run.done) s.lines.push(`Carrera: ${byKind.run.done} de ${byKind.run.planned}.`);
  if (byKind.swim.planned || byKind.swim.done) s.lines.push(`Natación: ${byKind.swim.done} de ${byKind.swim.planned}.`);
  if (withSteps.length) s.lines.push(`Pasos: objetivo cumplido ${met} de ${withSteps.length} días (media ${nf.format(Math.round(s.avgSteps!))}).`);
  if (s.avgSleepHours !== undefined) s.lines.push(`Sueño medio: ${nf.format(s.avgSleepHours)} h.`);
  if (s.weightChangeKg !== undefined) {
    const sign = s.weightChangeKg > 0 ? '+' : '';
    s.lines.push(`Peso: ${sign}${nf.format(s.weightChangeKg)} kg respecto a la semana anterior.`);
  }
  return s;
}
