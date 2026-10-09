import { describe, expect, it } from 'vitest';
import { karvonenZones } from '../cardioPlans/heartRateZones';
import { fiveKWeek, nextFiveKState, suggestFiveKPhase } from '../cardioPlans/fiveKPlan';
import { nextSwimState, swimSession, estimateSwimPace } from '../cardioPlans/swimPlan';
import { addDays, isoWeekday } from '../dates';
import { adjustedSets, adjustForRecovery, rescheduleMissed } from './adjustments';
import { TEMPLATES, templatesForDays, trainsLegs } from './gymTemplates';
import { loadCap, planWeek, type Activity, type DayAvailability, type PlannerInput, type WeekPlan } from './weekPlanner';

const MONDAY = '2026-10-12';
const ALL: Activity[] = ['gym', 'run', 'swim'];
const week = (f: (wd: number) => Activity[], maxMinutes?: (wd: number) => number | undefined): DayAvailability[] =>
  Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, allowed: f(i + 1), maxMinutes: maxMinutes?.(i + 1) }));

const input = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  weekStart: MONDAY,
  availability: week(() => ALL),
  maxGymDays: 3,
  threeDayTemplate: 'upperLowerFull',
  fiveK: { phase: 2, weekInPhase: 1 },
  swim: { phase: 1 },
  blockWeek: 1,
  previousWeekLoads: [],
  stepGoal: 10000,
  now: 0,
  ...over,
});

const gap = (a: string, b: string) => Math.abs(isoWeekday(a) - isoWeekday(b));
const legDates = (p: WeekPlan) => p.sessions.filter((s) => s.gymTemplate && trainsLegs(s.gymTemplate)).map((s) => s.date);
const hard = (p: WeekPlan) => p.sessions.filter((s) => s.intensity === 'hard');

function checkInvariants(p: WeekPlan) {
  // Max 1 hard cardio session per week.
  expect(hard(p).length).toBeLessThanOrEqual(1);
  // No hard run the day before or after a leg day.
  for (const h of hard(p)) for (const l of legDates(p)) expect(gap(h.date, l)).not.toBe(1);
  // One session per day at most, and a full rest day whenever there are ≥ 6 sessions.
  const active = p.sessions.filter((s) => s.status !== 'skipped');
  expect(new Set(active.map((s) => s.date)).size).toBe(active.length);
  expect(active.length).toBeLessThanOrEqual(6);
  // No two consecutive gym days sharing main muscle groups.
  const gym = active.filter((s) => s.kind === 'gym').sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < gym.length; i++) {
    if (gap(gym[i]!.date, gym[i - 1]!.date) === 1) {
      const a = TEMPLATES[gym[i]!.gymTemplate!].groups;
      const b = TEMPLATES[gym[i - 1]!.gymTemplate!].groups;
      expect(a.some((g) => b.includes(g))).toBe(false);
    }
  }
}

describe('templates', () => {
  it('follow the table by number of days', () => {
    expect(templatesForDays(5, 'upperLowerFull')).toEqual(['Empuje A', 'Tracción A', 'Pierna', 'Empuje B', 'Tracción B']);
    expect(templatesForDays(3, 'upperLowerFull')).toEqual(['Tren superior', 'Pierna', 'Cuerpo completo']);
    expect(templatesForDays(3, 'pushPullLegs')).toEqual(['Empuje', 'Tracción', 'Pierna']);
  });
  it('never drop legs with 2 or more gym days', () => {
    for (const n of [2, 3, 4, 5]) for (const t of ['upperLowerFull', 'pushPullLegs'] as const) expect(templatesForDays(n, t).some(trainsLegs)).toBe(true);
  });
});

describe('planWeek', () => {
  it('builds a typical 3-gym-day week respecting every rule', () => {
    const p = planWeek(input());
    checkInvariants(p);
    expect(p.sessions.filter((s) => s.kind === 'gym').map((s) => s.gymTemplate).sort()).toEqual(['Cuerpo completo', 'Pierna', 'Tren superior']);
    const runs = p.sessions.filter((s) => s.kind === 'run');
    expect(runs.filter((r) => r.run?.slot !== 'C')).toHaveLength(2);
    expect(hard(p)).toHaveLength(1);
    expect(p.sessions.every((s) => s.rationale.length > 0)).toBe(true);
  });

  it('downgrades the long run when the only run days touch the leg day', () => {
    // Gym only Mon/Wed/Fri; runs only Tue/Thu — every run day is next to a gym day.
    const p = planWeek(
      input({
        availability: week((wd) => (wd === 1 || wd === 3 || wd === 5 ? ['gym'] : wd === 2 || wd === 4 ? ['run'] : [])),
      }),
    );
    checkInvariants(p);
    const b = p.sessions.find((s) => s.run?.slot === 'B')!;
    const touchesLegs = legDates(p).some((l) => gap(l, b.date) === 1);
    if (touchesLegs) expect(b.intensity).not.toBe('hard');
  });

  it('5 gym days: at most 2 cardio sessions, all easy', () => {
    const p = planWeek(input({ maxGymDays: 5 }));
    checkInvariants(p);
    expect(p.sessions.filter((s) => s.kind === 'gym')).toHaveLength(5);
    const cardio = p.sessions.filter((s) => s.kind !== 'gym');
    expect(cardio.length).toBeLessThanOrEqual(2);
    expect(cardio.every((s) => s.intensity === 'easy')).toBe(true);
  });

  it('deload week: −40 % sets and only easy cardio', () => {
    const p = planWeek(input({ blockWeek: 4 }));
    checkInvariants(p);
    expect(p.deload).toBe(true);
    expect(p.sessions.filter((s) => s.kind === 'gym').every((s) => s.setsFactor === 0.6)).toBe(true);
    expect(hard(p)).toHaveLength(0);
    expect(p.warnings[0]).toMatch(/descarga/);
  });

  it('no gym: warns about muscle loss and plans 2 runs + 2 swims, one moderate', () => {
    const p = planWeek(input({ availability: week(() => ['run', 'swim']) }));
    checkInvariants(p);
    expect(p.warnings.join(' ')).toMatch(/perder músculo/);
    expect(p.sessions.filter((s) => s.kind === 'run' && s.run?.slot !== 'C')).toHaveLength(2);
    const swims = p.sessions.filter((s) => s.kind === 'swim');
    expect(swims).toHaveLength(2);
    expect(swims.filter((s) => s.intensity === 'moderate')).toHaveLength(1);
  });

  it('keeps a rest day when everything is allowed every day', () => {
    const p = planWeek(input({ maxGymDays: 4 }));
    checkInvariants(p);
    expect(p.sessions.length).toBeLessThan(7);
  });

  it('planning mid-week only uses the remaining days', () => {
    const p = planWeek(input({ availableFrom: addDays(MONDAY, 4) }));
    expect(p.sessions.every((s) => s.date >= addDays(MONDAY, 4))).toBe(true);
    expect(p.sessions.length).toBeGreaterThan(0);
  });

  it('respects the minutes available per day', () => {
    const p = planWeek(input({ availability: week(() => ALL, () => 30) }));
    expect(p.sessions.filter((s) => s.kind === 'gym')).toHaveLength(0); // gym needs ≥ 40 min
    expect(p.sessions.every((s) => s.minutes <= 30)).toBe(true);
  });

  it('says when only one key run fits (the 5K week will repeat)', () => {
    const p = planWeek(input({ availability: week((wd) => (wd === 6 ? ['run'] : ['gym'])) }));
    expect(p.warnings.join(' ')).toMatch(/Solo cabe 1 carrera/);
  });

  it('raises the step goal to 12,000 on free days when cardio is scarce', () => {
    const p = planWeek(input({ availability: week((wd) => (wd <= 3 ? ['gym'] : wd === 6 ? ['run'] : [])) }));
    const free = Object.entries(p.stepTargets).filter(([d]) => !p.sessions.some((s) => s.date === d));
    expect(free.every(([, v]) => v === 12000)).toBe(true);
  });

  it('caps the weekly load at +10 % of the previous 3 weeks', () => {
    const free = planWeek(input());
    const total = (p: WeekPlan) => p.sessions.reduce((a, s) => a + s.load, 0);
    const prev = (total(free) * 0.85) / 1.1; // cap = 85 % of the unconstrained week
    const p = planWeek(input({ previousWeekLoads: [prev, prev, prev] }));
    expect(total(p)).toBeLessThanOrEqual(total(free) * 0.85 + 1e-6);
    expect(p.warnings.join(' ')).toMatch(/Límite de carga/);
    expect(p.sessions.some((s) => s.gymTemplate === 'Pierna')).toBe(true); // legs are never cut
  });

  it('never cuts legs or key runs, and says so when the cap cannot be met', () => {
    const p = planWeek(input({ previousWeekLoads: [300, 300, 300] }));
    expect(p.sessions.some((s) => s.gymTemplate === 'Pierna')).toBe(true);
    expect(p.sessions.filter((s) => s.run?.slot === 'A' || s.run?.slot === 'B')).toHaveLength(2);
    expect(p.warnings.join(' ')).toMatch(/supera el límite/);
  });
});

describe('loadCap', () => {
  it('has no limit without 3 weeks of history', () => {
    expect(loadCap([1000, 1000])).toBeUndefined();
  });
  it('starts at 70 % after a break', () => {
    expect(loadCap([1000, 1000, 1000, 200])).toEqual({ limit: 700, reason: expect.stringMatching(/parón/) });
  });
});

describe('rescheduleMissed', () => {
  const base = planWeek(input());

  it('moves a missed session to the next valid day and explains why', () => {
    const s = base.sessions[0]!;
    const { plan } = rescheduleMissed(base, s.id, s.date, 'estabas en rojo', 1);
    const moved = plan.sessions.find((x) => x.id === s.id)!;
    expect(moved.date > s.date).toBe(true);
    expect(moved.status).toBe('moved');
    expect(moved.rationale.at(-1)).toMatch(/^Movida al .+ porque el .+ estabas en rojo\.$/);
    checkInvariants(plan);
  });

  it('drops the session when nothing fits later in the week', () => {
    const last = base.sessions[base.sessions.length - 1]!;
    const { plan, message } = rescheduleMissed(base, last.id, addDays(MONDAY, 6), 'no pudiste', 1);
    expect(plan.sessions.find((x) => x.id === last.id)!.status).toBe('skipped');
    expect(message).toMatch(/descartada/);
  });

  it('replaces a less important session when the week is full', () => {
    const full = planWeek(input({ availability: week((wd) => (wd <= 5 ? ALL : [])), maxGymDays: 3 }));
    const gym = full.sessions.find((s) => s.kind === 'gym' && s.priority === 5)!; // legs
    const { plan } = rescheduleMissed(full, gym.id, gym.date, 'no pudiste', 1);
    const moved = plan.sessions.find((x) => x.id === gym.id)!;
    if (moved.status === 'moved') expect(plan.sessions.some((x) => x.status === 'skipped' && x.priority < 5) || moved.date !== gym.date).toBe(true);
  });
});

describe('recovery adjustments', () => {
  const p = planWeek(input());
  const gym = p.sessions.find((s) => s.kind === 'gym')!;
  const run = p.sessions.find((s) => s.intensity === 'hard')!;

  it('yellow: gym RIR +1 and −1 set; hard cardio becomes easy', () => {
    expect(adjustForRecovery(p, gym, 'yellow')).toMatchObject({ action: 'downgrade', rirDelta: 1, setsDelta: -1 });
    expect(adjustForRecovery(p, run, 'yellow').advice).toMatch(/suave/);
    expect(adjustedSets(3, 1, -1)).toBe(2);
  });

  it('red: suggest moving gym or going light (2 sets, RIR 3); cardio becomes active recovery', () => {
    const r = adjustForRecovery(p, gym, 'red');
    expect(r.action).toBe('moveOrLight');
    expect(adjustedSets(4, 1, r.setsDelta)).toBe(2);
    expect(adjustForRecovery(p, run, 'red').action).toBe('activeRecovery');
  });

  it('green: as planned', () => {
    expect(adjustForRecovery(p, gym, 'green').action).toBe('asPlanned');
  });
});

describe('cardio plans', () => {
  it('computes Z2 with Karvonen (179 max, 62 rest → ~132–144)', () => {
    const z2 = karvonenZones(179, 62)[1]!;
    expect([z2.min, z2.max]).toEqual([132, 144]);
  });

  it('phase 2 week 1: 4 × (5 + 1) and the long one 5 × (5 + 1)', () => {
    const [a, b] = fiveKWeek({ phase: 2, weekInPhase: 1 });
    expect(a.main).toBe('4 × (5 min corriendo + 1 min caminando)');
    expect(b.main).toBe('5 × (5 min corriendo + 1 min caminando)');
    expect(a.intensity).toBe('easy');
    expect(b.intensity).toBe('hard');
    expect(fiveKWeek({ phase: 2, weekInPhase: 1 }, false)[1].intensity).toBe('easy');
  });

  it('advances only with both key sessions at effort ≤ 6 and HR ≤ Z3', () => {
    const s = { phase: 1 as const, weekInPhase: 2 };
    const z3 = 156;
    expect(nextFiveKState(s, [{ slot: 'A', done: true, effort: 5 }], z3).advanced).toBe(false);
    expect(nextFiveKState(s, [{ slot: 'A', done: true, effort: 5 }, { slot: 'B', done: true, effort: 7 }], z3).advanced).toBe(false);
    expect(nextFiveKState(s, [{ slot: 'A', done: true, effort: 5 }, { slot: 'B', done: true, avgHR: 160 }], z3).advanced).toBe(false);
    const ok = nextFiveKState(s, [{ slot: 'A', done: true, effort: 5 }, { slot: 'B', done: true, effort: 6, avgHR: 150 }], z3);
    expect(ok.state).toEqual({ phase: 2, weekInPhase: 1 });
    expect(nextFiveKState({ phase: 5, weekInPhase: 1 }, [{ slot: 'A', done: true }, { slot: 'B', done: true }], z3).state.completed).toBe(true);
  });

  it('suggests the starting phase from recent runs (22–38 min outings → phase 2)', () => {
    expect(suggestFiveKPhase([])).toBe(1);
    expect(suggestFiveKPhase([{ durationMin: 22 }, { durationMin: 33 }, { durationMin: 38 }])).toBe(2);
    expect(suggestFiveKPhase([{ durationMin: 20 }, { durationMin: 24 }])).toBe(1);
  });

  it('swim phase 1 is 1,000–1,200 m with warm-up and cool-down', () => {
    expect(swimSession({ phase: 1 }, 'easy').totalM).toBe(1100);
    expect(swimSession({ phase: 1 }, 'moderate').totalM).toBe(1300);
    expect(nextSwimState({ phase: 1 }, true, 120, 156).state).toEqual({ phase: 2 });
    expect(nextSwimState({ phase: 1 }, false, 120, 156).advanced).toBe(false);
    expect(estimateSwimPace([{ distanceM: 1150, durationMin: 55 }])).toBeCloseTo(4.78, 2);
  });
});
