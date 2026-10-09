import { describe, expect, it } from 'vitest';
import { buildBriefing, mergeHealthInputs } from './briefing';
import { addDays } from './dates';
import type { DailyHealth } from './health/dailyMetrics';
import { planToIcs } from './planner/calendarExport';
import { planWeek, type WeekPlan } from './planner/weekPlanner';
import { weeklySummary } from './planner/weeklySummary';

const MONDAY = '2026-10-12';
const plan: WeekPlan = planWeek({
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

/** 28 normal days before `date` so recovery is not calibrating. */
function history(date: string, today: Partial<DailyHealth>): DailyHealth[] {
  const out: DailyHealth[] = [];
  for (let i = 28; i >= 1; i--) out.push({ date: addDays(date, -i), hrvSDNN: i % 2 ? 60 : 70, restingHR: 62, sleepHours: 7.5 });
  out.push({ date, hrvSDNN: 65, restingHR: 62, sleepHours: 7.5, ...today });
  return out;
}

describe('briefing', () => {
  const gymDay = plan.sessions.find((s) => s.kind === 'gym')!;

  it('morning: green day says the session as planned', () => {
    const b = buildBriefing({ kind: 'morning', date: gymDay.date, days: history(gymDay.date, {}), plans: [plan], stepGoal: 10000 });
    expect(b.notify).toBe(true);
    expect(b.title).toBe(`🟢 Hoy: ${gymDay.gymTemplate}`);
    expect(b.body).toMatch(/Dormiste 7 h 30 min\. Pasos: 10\.000\./);
  });

  it('morning: red day gives the reason and the adjustment', () => {
    const b = buildBriefing({ kind: 'morning', date: gymDay.date, days: history(gymDay.date, { sleepHours: 4.5 }), plans: [plan], stepGoal: 10000 });
    expect(b.title.startsWith('🔴')).toBe(true);
    expect(b.body).toMatch(/Dormiste 4 h 30 min/);
    expect(b.body).toMatch(/Rojo:/);
  });

  it('morning without a plan asks to plan', () => {
    expect(buildBriefing({ kind: 'morning', date: MONDAY, days: [], plans: [], stepGoal: 10000 }).body).toMatch(/Planifica/);
  });

  it('steps: only notifies when more than 3,000 are missing', () => {
    const date = addDays(MONDAY, 2);
    expect(buildBriefing({ kind: 'steps', date, days: [{ date, steps: 5000 }], plans: [plan], stepGoal: 10000 })).toMatchObject({ notify: true, title: 'Faltan 5000 pasos' }); // es-ES: no separator for 4 digits
    expect(buildBriefing({ kind: 'steps', date, days: [{ date, steps: 8000 }], plans: [plan], stepGoal: 10000 }).notify).toBe(false);
  });

  it('sunday: reminds to plan only when next week has no plan', () => {
    const sunday = addDays(MONDAY, 6);
    expect(buildBriefing({ kind: 'sunday', date: sunday, days: [], plans: [plan], stepGoal: 10000 }).notify).toBe(true);
    const next = { ...plan, weekStart: addDays(MONDAY, 7) };
    expect(buildBriefing({ kind: 'sunday', date: sunday, days: [], plans: [plan, next], stepGoal: 10000 }).notify).toBe(false);
  });

  it('merges several payloads', () => {
    const a = { steps: [{ date: 'x', value: 1 }], sleep: [], hrv: [], restingHR: [], respiratoryRate: [], wristTemp: [], bodyMass: [] };
    expect(mergeHealthInputs([a, a]).steps).toHaveLength(2);
  });
});

describe('calendar export', () => {
  it('produces a valid all-day VEVENT per session with stable UIDs and escaping', () => {
    const ics = planToIcs(plan, (id) => (id === 'leg-press-45' ? 'Prensa 45°, máquina' : id), 0);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(plan.sessions.length);
    expect(ics).toContain(`DTSTART;VALUE=DATE:${plan.sessions[0]!.date.replace(/-/g, '')}`);
    expect(ics).toContain('Prensa 45°\\, máquina');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(planToIcs(plan, undefined, 0)).toBe(planToIcs(plan, undefined, 0));
  });
});

describe('weekly summary', () => {
  it('counts planned vs done and the week health picture', () => {
    const p: WeekPlan = structuredClone(plan);
    p.sessions.filter((s) => s.kind === 'gym').slice(0, 2).forEach((s) => (s.status = 'done'));
    const days: DailyHealth[] = [
      { date: addDays(MONDAY, -2), bodyMassKg: 71.4 },
      { date: MONDAY, steps: 12000, sleepHours: 7 },
      { date: addDays(MONDAY, 1), steps: 8000, sleepHours: 8, bodyMassKg: 71.0 },
    ];
    const s = weeklySummary(p, days, []);
    expect(s.byKind.gym).toEqual({ planned: 3, done: 2 });
    expect(s.stepDays).toEqual({ met: 1, withData: 2 });
    expect(s.avgSleepHours).toBe(7.5);
    expect(s.weightChangeKg).toBeCloseTo(-0.4, 5);
    expect(s.lines[0]).toBe('Gimnasio: 2 de 3 sesiones.');
  });

  it('mid-week: planned is the whole week, done only up to today', () => {
    const s = weeklySummary(plan, [], [], MONDAY);
    expect(s.byKind.gym.planned).toBe(3);
    expect(s.byKind.gym.done).toBe(0);
  });
});
