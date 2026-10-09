import { describe, expect, it } from 'vitest';
import { buildDailyHealth } from '../../domain/health/dailyMetrics';
import {
  HealthPayloadError,
  parseHealthPayload,
  parseNumber,
  parseSleepStage,
  parseWorkoutKind,
} from './payload';
import fixture from './__fixtures__/payload-es.json';

describe('parseNumber', () => {
  it.each([
    [62, 62],
    ['62', 62],
    ['62,5', 62.5],
    ['62.5', 62.5],
    ['15.400', 15400],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['62 lpm', 62],
    ['', undefined],
    [null, undefined],
  ])('%s → %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe('labels in Spanish and English', () => {
  it('maps sleep stages', () => {
    expect(parseSleepStage('Núcleo')).toBe('core');
    expect(parseSleepStage('Profundo')).toBe('deep');
    expect(parseSleepStage('REM')).toBe('rem');
    expect(parseSleepStage('Dormido')).toBe('unspecified');
    expect(parseSleepStage('En cama')).toBe('inBed');
    expect(parseSleepStage('Despierto')).toBe('awake');
    expect(parseSleepStage('Asleep Core')).toBe('core');
  });

  it('maps workout types', () => {
    expect(parseWorkoutKind('Carrera')).toBe('run');
    expect(parseWorkoutKind('Natación en piscina')).toBe('swim');
    expect(parseWorkoutKind('Entrenamiento de fuerza tradicional')).toBe('strength');
    expect(parseWorkoutKind('Caminata')).toBe('walk');
    expect(parseWorkoutKind('Yoga')).toBe('other');
  });
});

describe('parseHealthPayload', () => {
  it('rejects text that is not JSON with a Spanish message', () => {
    expect(() => parseHealthPayload('hola')).toThrow(HealthPayloadError);
  });

  it('rejects payloads without a version', () => {
    expect(() => parseHealthPayload({ steps: [] })).toThrow(/versión/);
  });

  it('parses the Spanish-locale fixture into daily metrics', () => {
    const parsed = parseHealthPayload(JSON.stringify(fixture));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.workouts.map((w) => w.kind)).toEqual(['strength', 'run']);
    expect(parsed.workouts[1]?.distanceM).toBe(3120);

    const days = buildDailyHealth(parsed, 'Europe/Madrid');
    const oct8 = days.find((d) => d.date === '2026-10-08');
    expect(oct8).toMatchObject({
      steps: 15400,
      restingHR: 61,
      bodyMassKg: 71.2,
      hrvFromNight: true,
    });
    // Watch staged sleep: 23:30 → 07:00 = 7.5 h; the overlapping iPhone block is ignored.
    expect(oct8?.sleepHours).toBe(7.5);
    // Night HRV (01:00 and 04:00 readings) wins over the afternoon one; the 23:45 reading of
    // the previous calendar day also belongs to this night.
    expect(oct8?.hrvSDNN).toBe(65);
  });
});
