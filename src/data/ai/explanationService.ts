// Claude explains the plan and answers free questions (spec 11). Input = the plan JSON and
// aggregated recovery data only (never raw Health series). Claude never changes the plan: the
// deterministic planner decides; the text only describes it.

import { addDays, formatDuration, type DateKey } from '../../domain/dates';
import { mean, previousValues } from '../../domain/health/baseline';
import type { DailyHealth } from '../../domain/health/dailyMetrics';
import type { RecoveryResult } from '../../domain/recovery/recoveryEngine';
import { dayName, type WeekPlan } from '../../domain/planner/weekPlanner';
import { createMessage, responseText, type CallOptions, type ClaudeConfig } from './anthropicClient';

const RULES = `Reglas del planificador (deterministas; tú no decides nada):
- Prioridad: el gimnasio (hipertrofia) y bajar grasa son lo principal. Carrera y natación complementan los días sin gimnasio; si no caben, no pasa nada.
- Gimnasio con la máxima separación; nunca dos días seguidos con los mismos grupos. La pierna nunca se elimina con 2 o más días de gimnasio.
- Ninguna carrera exigente el día antes ni el día después de pierna. Máximo 1 sesión de cardio exigente por semana.
- Natación preferente el día después de pierna o de la carrera larga.
- Carga semanal ≤ 1,1 × la media de las 3 semanas anteriores (70 % tras un parón); se recorta cardio, nunca gimnasio. Cada 4.ª semana, descarga (−40 % de series, cardio suave).
- Semáforo de recuperación: amarillo → RIR +1 y una serie menos, cardio solo Z2; rojo → mover el gimnasio o sesión ligera (2 series, RIR 3), cardio → paseo o descanso.
- Pasos: 10.000 al día (12.000 los días sin sesión en semanas con poco cardio).`;

const SYSTEM = `Eres el asistente de FitPlan, una app personal de organización del entrenamiento. Respondes en español de España, en tono directo y cercano, con frases cortas.

${RULES}

Límites estrictos:
- No inventes sesiones, días, ejercicios, pesos, series ni cifras que no estén en los datos que te doy.
- No propongas cargas (kg) ni cambies el plan: si algo debería cambiar, di qué botón de la app usar ("No puedo", "Mover a…", replanificar).
- No es una app médica: nada de diagnósticos ni objetivos de calorías. Si algo suena a problema de salud, sugiere consultar con un profesional.
- Si no tienes un dato, dilo.`;

export interface PlanContext {
  today: DateKey;
  recovery?: { state: string; reasons: string[] };
  aggregates: Record<string, string>;
  week?: unknown;
  nextWeek?: unknown;
  fiveK?: unknown;
  swim?: unknown;
}

function compactPlan(plan: WeekPlan) {
  return {
    semana: plan.weekStart,
    descarga: plan.deload,
    avisos: plan.warnings,
    sesiones: plan.sessions.map((s) => ({
      dia: `${dayName(s.date)} ${s.date}`,
      tipo: s.kind,
      sesion: s.gymTemplate ?? s.run?.title ?? s.swim?.title,
      detalle: s.run?.main ?? s.swim?.main,
      intensidad: s.intensity,
      minutos: s.minutes,
      estado: s.status,
      motivo: s.rationale,
    })),
  };
}

/** Aggregates only: last night + averages, never raw sample series. */
export function buildContext(input: {
  today: DateKey;
  days: ReadonlyArray<DailyHealth>;
  recovery?: RecoveryResult;
  plans: ReadonlyArray<WeekPlan>;
  monday: DateKey;
  fiveK?: unknown;
  swim?: unknown;
}): PlanContext {
  const { today, days } = input;
  const t = days.find((d) => d.date === today);
  const fmt = (v: number | undefined, f: (x: number) => string) => (v === undefined ? 'sin dato' : f(v));
  const r1 = (x: number) => String(Math.round(x * 10) / 10);
  const plan = input.plans.find((p) => p.weekStart === input.monday);
  const next = input.plans.find((p) => p.weekStart === addDays(input.monday, 7));
  return {
    today: `${dayName(today)} ${today}`,
    recovery: input.recovery ? { state: input.recovery.state, reasons: input.recovery.reasons } : undefined,
    aggregates: {
      sueno_anoche: fmt(t?.sleepHours, formatDuration),
      sueno_media_14d: fmt(mean(previousValues(days, 'sleepHours', today, 14)), formatDuration),
      vfc_hoy_ms: fmt(t?.hrvSDNN, r1),
      vfc_media_28d_ms: fmt(mean(previousValues(days, 'hrvSDNN', today, 28)), r1),
      pulso_reposo_hoy: fmt(t?.restingHR, r1),
      pulso_reposo_media_28d: fmt(mean(previousValues(days, 'restingHR', today, 28)), r1),
      pasos_hoy: fmt(t?.steps, (x) => String(Math.round(x))),
      pasos_media_7d: fmt(mean(previousValues(days, 'steps', today, 7)), (x) => String(Math.round(x))),
      peso_ultimo_kg: fmt([...days].reverse().find((d) => d.bodyMassKg !== undefined)?.bodyMassKg, r1),
    },
    week: plan ? compactPlan(plan) : undefined,
    nextWeek: next ? compactPlan(next) : undefined,
    fiveK: input.fiveK,
    swim: input.swim,
  };
}

async function ask(cfg: ClaudeConfig, ctx: PlanContext, instruction: string, opts?: CallOptions): Promise<string> {
  const msg = await createMessage(
    cfg,
    {
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: `Datos (JSON):\n${JSON.stringify(ctx)}\n\n${instruction}` }],
    },
    opts,
  );
  return responseText(msg).trim();
}

export function explainPlan(cfg: ClaudeConfig, ctx: PlanContext, opts?: CallOptions): Promise<string> {
  return ask(
    cfg,
    ctx,
    'Resume el plan de la semana en 3–5 frases: qué días hay gimnasio y cuáles cardio, la lógica principal (por qué ese orden) y un consejo práctico. Sin listas largas ni títulos.',
    opts,
  );
}

export function answerQuestion(cfg: ClaudeConfig, ctx: PlanContext, question: string, opts?: CallOptions): Promise<string> {
  return ask(cfg, ctx, `Pregunta del usuario: «${question.trim()}»\nResponde en pocas frases usando solo estos datos y las reglas.`, opts);
}

/** Deterministic summary used without an API key. */
export function templateSummary(plan: WeekPlan): string {
  const by = (k: string) => plan.sessions.filter((s) => s.kind === k && s.status !== 'skipped');
  const days = (k: string) => by(k).map((s) => dayName(s.date)).join(', ');
  const parts: string[] = [];
  const gym = by('gym');
  if (gym.length) parts.push(`${gym.length} días de gimnasio (${days('gym')}): ${gym.map((s) => s.gymTemplate).join(', ')}.`);
  else parts.push('Esta semana no hay gimnasio.');
  if (by('run').length) parts.push(`Carrera: ${days('run')}.`);
  if (by('swim').length) parts.push(`Natación: ${days('swim')}.`);
  const hard = plan.sessions.find((s) => s.intensity === 'hard');
  if (hard) parts.push(`La única sesión exigente es el ${dayName(hard.date)}.`);
  if (plan.deload) parts.push('Es semana de descarga: menos series y cardio suave.');
  return parts.join(' ');
}
