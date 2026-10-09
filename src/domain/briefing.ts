// Notification texts (spec 9 "Notificaciones"), shared by the app and the sync Worker so the
// shortcut's notifications say exactly what the app would: today's session adjusted to recovery,
// missing steps in the afternoon, and the Sunday planning reminder.

import { addDays, formatDuration, isoWeekday, type DateKey } from './dates';
import type { DailyHealth, HealthInput } from './health/dailyMetrics';
import { adjustForRecovery } from './planner/adjustments';
import type { WeekPlan } from './planner/weekPlanner';
import { evaluateRecovery } from './recovery/recoveryEngine';
import type { RecoveryConfig } from './recovery/recoveryConfig';
import { weekStart } from './strength/strength';

export type BriefingKind = 'morning' | 'steps' | 'sunday';

export interface Briefing {
  /** False when there is nothing worth a notification (the shortcut then stays silent). */
  notify: boolean;
  title: string;
  body: string;
}

export interface BriefingInput {
  kind: BriefingKind;
  date: DateKey;
  days: ReadonlyArray<DailyHealth>;
  plans: ReadonlyArray<WeekPlan>;
  recoveryConfig?: RecoveryConfig;
  stepGoal: number;
}

const STATE_LABEL = { green: '🟢', yellow: '🟡', red: '🔴', calibrating: '⚪️', noData: '⚪️' } as const;
const nf = new Intl.NumberFormat('es-ES');

function sessionName(s: WeekPlan['sessions'][number]): string {
  if (s.kind === 'gym') return s.gymTemplate ?? 'Gimnasio';
  if (s.kind === 'run') return s.run?.title ?? 'Carrera';
  if (s.kind === 'swim') return s.swim?.title ?? 'Natación';
  return 'Descanso';
}

export function buildBriefing(input: BriefingInput): Briefing {
  const { date } = input;
  const plan = input.plans.find((p) => p.weekStart === weekStart(date));
  const target = plan?.stepTargets[date] ?? input.stepGoal;

  if (input.kind === 'sunday') {
    const next = addDays(weekStart(date), 7);
    const planned = input.plans.some((p) => p.weekStart === next);
    return planned
      ? { notify: false, title: 'FitPlan', body: 'La semana que viene ya está planificada.' }
      : { notify: true, title: 'Planifica la semana', body: 'Abre FitPlan → Semana → Próxima y marca qué días puedes entrenar.' };
  }

  if (input.kind === 'steps') {
    const steps = input.days.find((d) => d.date === date)?.steps ?? 0;
    const missing = target - steps;
    if (missing > 3000) {
      return { notify: true, title: `Faltan ${nf.format(missing)} pasos`, body: `Llevas ${nf.format(steps)} de ${nf.format(target)}. Un paseo de ~${Math.round(missing / 110)} min y listo.` };
    }
    return { notify: false, title: 'Pasos', body: missing > 0 ? `Te faltan ${nf.format(missing)} pasos.` : 'Objetivo de pasos cumplido.' };
  }

  // Morning.
  const r = evaluateRecovery(input.days, date, { config: input.recoveryConfig });
  const lines: string[] = [];
  const today = input.days.find((d) => d.date === date);
  if (today?.sleepHours !== undefined) lines.push(`Dormiste ${formatDuration(today.sleepHours)}.`);
  if (r.state === 'yellow' || r.state === 'red') lines.push(r.reasons[0] ?? '');

  const sessions = plan?.sessions.filter((s) => s.date === date && s.status !== 'skipped' && s.status !== 'done') ?? [];
  let title: string;
  if (!plan) {
    title = `${STATE_LABEL[r.state]} Hoy sin plan`;
    lines.push(isoWeekday(date) >= 6 ? 'Planifica la semana que viene en FitPlan.' : 'Planifica la semana en FitPlan.');
  } else if (sessions.length === 0) {
    title = `${STATE_LABEL[r.state]} Hoy: descanso`;
    lines.push(`Solo pasos: objetivo ${nf.format(target)}.`);
  } else {
    title = `${STATE_LABEL[r.state]} Hoy: ${sessions.map(sessionName).join(' + ')}`;
    for (const s of sessions) {
      const adj = adjustForRecovery(plan, s, r.state);
      if (adj.action !== 'asPlanned') lines.push(adj.advice);
      else if (s.run) lines.push(s.run.main + '.');
      else if (s.swim) lines.push(s.swim.main + '.');
    }
    lines.push(`Pasos: ${nf.format(target)}.`);
  }
  return { notify: true, title, body: lines.filter(Boolean).join(' ') };
}

/** Concatenates several Health payloads into one input (overlaps are de-duplicated downstream). */
export function mergeHealthInputs(inputs: ReadonlyArray<HealthInput>): HealthInput {
  return {
    steps: inputs.flatMap((i) => i.steps),
    sleep: inputs.flatMap((i) => i.sleep),
    hrv: inputs.flatMap((i) => i.hrv),
    restingHR: inputs.flatMap((i) => i.restingHR),
    respiratoryRate: inputs.flatMap((i) => i.respiratoryRate),
    wristTemp: inputs.flatMap((i) => i.wristTemp),
    bodyMass: inputs.flatMap((i) => i.bodyMass),
  };
}
