import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { DailyHealth } from '../health/dailyMetrics';
import { evaluateRecovery } from './recoveryEngine';
import { DEFAULT_RECOVERY_CONFIG } from './recoveryConfig';

const TODAY = '2026-10-09';

/** 28 normal days before today: HRV alternating 60/70 ms, RHR 62, sleep 7.5 h. */
function history(today: Partial<DailyHealth>, days = 28): DailyHealth[] {
  const out: DailyHealth[] = [];
  for (let i = days; i >= 1; i--) {
    out.push({ date: addDays(TODAY, -i), hrvSDNN: i % 2 ? 60 : 70, restingHR: 62, sleepHours: 7.5 });
  }
  out.push({ date: TODAY, hrvSDNN: 65, restingHR: 62, sleepHours: 7.5, ...today });
  return out;
}

const evalToday = (today: Partial<DailyHealth>, opts = {}) => evaluateRecovery(history(today), TODAY, opts);

describe('evaluateRecovery — states', () => {
  it('is green when everything is in range', () => {
    const r = evalToday({});
    expect(r.state).toBe('green');
    expect(r.conditions).toEqual([]);
    expect(r.reasons[0]).toMatch(/rango habitual/);
  });

  it('is noData when there is nothing for today', () => {
    const h = history({}).filter((d) => d.date !== TODAY);
    expect(evaluateRecovery(h, TODAY).state).toBe('noData');
  });

  it('is calibrating with too little history, but absolute sleep rules still apply', () => {
    expect(evaluateRecovery(history({}, 5), TODAY).state).toBe('calibrating');
    expect(evaluateRecovery(history({ sleepHours: 4.5 }, 5), TODAY).state).toBe('red');
  });

  it('turns red with two yellow conditions at once', () => {
    const r = evalToday({ restingHR: 66, sleepHours: 6 });
    expect(r.conditions.map((c) => c.level)).toEqual(['yellow', 'yellow']);
    expect(r.state).toBe('red');
    expect(r.reasons[0]).toMatch(/2 señales/);
  });
});

describe('evaluateRecovery — boundaries', () => {
  it.each([
    [65, 'green'], // +3
    [66, 'yellow'], // +4 (≥)
    [68, 'yellow'], // +6
    [69, 'red'], // +7 (≥)
  ])('resting HR %i → %s', (rhr, state) => {
    expect(evalToday({ restingHR: rhr }).state).toBe(state);
  });

  it.each([
    [6.5, 'green'], // not < 6.5 and only 1 h below the 7.5 h mean (needs > 1 h)
    [6.49, 'yellow'],
    [5, 'yellow'], // not < 5
    [4.99, 'red'],
  ])('sleep %f h → %s', (sleep, state) => {
    expect(evalToday({ sleepHours: sleep }).state).toBe(state);
  });

  it('flags sleep more than 1 h below the 14-day mean even above 6.5 h', () => {
    const base = history({});
    for (const d of base) if (d.date !== TODAY) d.sleepHours = 8.5;
    expect(evaluateRecovery(base.map((d) => (d.date === TODAY ? { ...d, sleepHours: 7.5 } : d)), TODAY).state).toBe(
      'green',
    ); // exactly 1 h below
    expect(evaluateRecovery(base.map((d) => (d.date === TODAY ? { ...d, sleepHours: 7.4 } : d)), TODAY).state).toBe(
      'yellow',
    );
  });

  it('HRV z thresholds are strict (<)', () => {
    // A low 7-day HRV pushes z down; read z, then place the threshold exactly on it.
    const h = history({ hrvSDNN: 40 });
    for (const d of h.slice(-7)) d.hrvSDNN = 45;
    const z = evaluateRecovery(h, TODAY).metrics.hrvZ!;
    expect(z).toBeLessThan(0);
    const at = (hrvZYellow: number) =>
      evaluateRecovery(h, TODAY, { config: { ...DEFAULT_RECOVERY_CONFIG, hrvZYellow, hrvZRed: -99 } }).state;
    expect(at(z)).toBe('green');
    expect(at(z + 1e-9)).toBe('yellow');
  });

  it('a strong HRV drop alone is red', () => {
    const h = history({});
    for (const d of h.slice(-7)) d.hrvSDNN = 30;
    const r = evaluateRecovery(h, TODAY);
    expect(r.metrics.hrvZ!).toBeLessThan(-1.5);
    expect(r.state).toBe('red');
  });

  it('ACWR above 1.5 is yellow, exactly 1.5 is not', () => {
    expect(evalToday({}, { acwr: 1.5 }).state).toBe('green');
    expect(evalToday({}, { acwr: 1.51 }).state).toBe('yellow');
  });

  it('wrist temperature +0.5 °C and respiratory rate +2 are yellow', () => {
    const h = history({ wristTemp: 34.5, respiratoryRate: 16 });
    for (const d of h) if (d.date !== TODAY) Object.assign(d, { wristTemp: 34, respiratoryRate: 14 });
    const r = evaluateRecovery(h, TODAY);
    expect(r.conditions.map((c) => c.kind).sort()).toEqual(['resp', 'wristTemp']);
  });
});

describe('evaluateRecovery — reasons', () => {
  it('explains sleep in readable Spanish', () => {
    const r = evalToday({ sleepHours: 5 + 40 / 60 });
    expect(r.reasons).toContain('Dormiste 5 h 40 min, 1 h 50 min menos que tu media.');
  });

  it('explains resting HR with the delta and the mean', () => {
    expect(evalToday({ restingHR: 67 }).reasons[0]).toBe('Pulso en reposo 67 lpm, +5 sobre tu media (62).');
  });
});
