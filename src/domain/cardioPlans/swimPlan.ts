// Swim plan (spec section 8): 4 phases towards 500 m non-stop. Always warm-up and cool-down.
// Advance when a session is completed without stopping outside the rests and with moderate HR.

import type { Intensity } from './fiveKPlan';

export interface SwimState {
  phase: 1 | 2 | 3 | 4;
  completed?: boolean;
}

export interface SwimPrescription {
  title: string;
  warmupM: number;
  main: string;
  mainM: number;
  cooldownM: number;
  totalM: number;
  /** Rough duration from the user's pace (min per 100 m including short rests). */
  totalMin: number;
  intensity: Intensity;
  notes: string;
}

interface MainSet {
  main: string;
  mainM: number;
  restsMin: number;
}

/** [easy, moderate] main sets per phase. */
const MAIN: Record<SwimState['phase'], [MainSet, MainSet]> = {
  1: [
    { main: '8 × 100 m (30 s de descanso)', mainM: 800, restsMin: 3.5 },
    { main: '10 × 100 m (30 s de descanso)', mainM: 1000, restsMin: 4.5 },
  ],
  2: [
    { main: '4 × 200 m (30 s de descanso)', mainM: 800, restsMin: 1.5 },
    { main: '5 × 200 m (30 s de descanso)', mainM: 1000, restsMin: 2 },
  ],
  3: [
    { main: '4 × 300 m (40 s de descanso)', mainM: 1200, restsMin: 2 },
    { main: '3 × 400 m (45 s de descanso)', mainM: 1200, restsMin: 1.5 },
  ],
  4: [
    { main: '500 m seguidos + 6 × 100 m (20 s)', mainM: 1100, restsMin: 3 },
    { main: '500 m seguidos + 4 × 200 m (30 s)', mainM: 1300, restsMin: 2 },
  ],
};

const WARMUP_M = 200;
const COOLDOWN_M = 100;

/** Default pace from the user's last pool session: 1,150 m in 55 min ≈ 4.8 min/100 m with rests. */
export const DEFAULT_SWIM_PACE_MIN_PER_100 = 4.0;

export function swimSession(state: SwimState, intensity: 'easy' | 'moderate', pacePer100 = DEFAULT_SWIM_PACE_MIN_PER_100): SwimPrescription {
  const phase = state.completed ? 4 : state.phase;
  const m = MAIN[phase][intensity === 'easy' ? 0 : 1];
  const warmupM = phase === 4 ? 300 : WARMUP_M;
  const totalM = warmupM + m.mainM + COOLDOWN_M;
  return {
    title: intensity === 'easy' ? 'Natación técnica suave' : 'Natación moderada',
    warmupM,
    main: m.main,
    mainM: m.mainM,
    cooldownM: COOLDOWN_M,
    totalM,
    totalMin: Math.round((totalM / 100) * pacePer100 + m.restsMin),
    intensity,
    notes:
      intensity === 'easy'
        ? 'Calentamiento variado (crol, espalda, piernas con tabla). Series cómodas, respirando cada 3 brazadas si puedes.'
        : 'Series algo más largas manteniendo la técnica. FC moderada: que puedas hablar entre series.',
  };
}

export function nextSwimState(state: SwimState, completedWithoutStops: boolean, avgHR: number | undefined, z3Max: number): { state: SwimState; advanced: boolean } {
  if (state.completed || !completedWithoutStops || (avgHR !== undefined && avgHR > z3Max)) return { state, advanced: false };
  if (state.phase === 4) return { state: { ...state, completed: true }, advanced: true };
  return { state: { phase: (state.phase + 1) as SwimState['phase'] }, advanced: true };
}

/** Pace from recent pool sessions (distance m, duration min); falls back to the default. */
export function estimateSwimPace(sessions: ReadonlyArray<{ distanceM?: number; durationMin: number }>): number {
  const valid = sessions.filter((s) => s.distanceM && s.distanceM >= 300);
  if (valid.length === 0) return DEFAULT_SWIM_PACE_MIN_PER_100;
  const totalM = valid.reduce((a, s) => a + s.distanceM!, 0);
  const totalMin = valid.reduce((a, s) => a + s.durationMin, 0);
  return totalMin / (totalM / 100);
}
