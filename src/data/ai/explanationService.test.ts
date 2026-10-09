import { describe, expect, it } from 'vitest';
import { addDays } from '../../domain/dates';
import type { DailyHealth } from '../../domain/health/dailyMetrics';
import { planWeek } from '../../domain/planner/weekPlanner';
import { answerQuestion, buildContext, explainPlan, templateSummary } from './explanationService';

const MONDAY = '2026-10-12';
const plan = planWeek({
  weekStart: MONDAY,
  availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, allowed: ['gym', 'run', 'swim'] })),
  maxGymDays: 3,
  threeDayTemplate: 'upperLowerFull',
  fiveK: { phase: 2, weekInPhase: 1 },
  swim: { phase: 1 },
  blockWeek: 1,
  previousWeekLoads: [],
  stepGoal: 10000,
  now: 0,
});
const days: DailyHealth[] = Array.from({ length: 30 }, (_, i) => ({ date: addDays(MONDAY, i - 29), hrvSDNN: 60 + (i % 5), restingHR: 62, sleepHours: 7.5, steps: 12000 }));

describe('explanation service', () => {
  const ctx = buildContext({ today: MONDAY, days, plans: [plan], monday: MONDAY });

  it('sends only aggregates and the plan, never raw daily series', () => {
    const json = JSON.stringify(ctx);
    expect(ctx.aggregates.sueno_anoche).toBe('7 h 30 min');
    expect(ctx.aggregates.pasos_media_7d).toBe('12000');
    expect((ctx.week as { sesiones: unknown[] }).sesiones).toHaveLength(plan.sessions.length);
    // No per-day history of other dates leaks into the context.
    expect(json).not.toContain(addDays(MONDAY, -10));
  });

  it('asks Claude with the rules in the system prompt and returns the text', async () => {
    let body: { system: string; messages: Array<{ content: string }>; output_config: { effort: string } } | undefined;
    const fetch: typeof globalThis.fetch = async (_u, init) => {
      body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ id: 'm', model: 'x', stop_reason: 'end_turn', content: [{ type: 'text', text: ' Hola ' }] }), { status: 200 });
    };
    const cfg = { apiKey: 'k', model: 'claude-sonnet-5-5' };
    expect(await explainPlan(cfg, ctx, { fetch })).toBe('Hola');
    expect(body!.system).toMatch(/No inventes sesiones/);
    expect(body!.system).toMatch(/gimnasio \(hipertrofia\) y bajar grasa son lo principal/);
    expect(body!.output_config.effort).toBe('low');
    await answerQuestion(cfg, ctx, '¿Puedo correr mañana?', { fetch });
    expect(body!.messages[0]!.content).toContain('«¿Puedo correr mañana?»');
  });

  it('has a deterministic template without API key', () => {
    expect(templateSummary(plan)).toMatch(/^3 días de gimnasio/);
  });
});
