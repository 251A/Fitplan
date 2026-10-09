// 5K plan (spec section 8): 2 key sessions per week over 5 phases (~9 weeks), plus an optional
// very easy third run. Structure inspired by beginner running plans (Runna-style): walk warm-up and
// cool-down, conversational Z2 effort, one interval session, one "long" session that is the only
// one allowed to be hard, and a test week at the end.

export type Intensity = 'easy' | 'moderate' | 'hard';

export interface RunPrescription {
  /** 'A' = intervals (easy), 'B' = the longest session of the phase, 'C' = optional easy run. */
  slot: 'A' | 'B' | 'C';
  title: string;
  /** Human readable main set, e.g. "6 × (3 min corriendo + 1 min caminando)". */
  main: string;
  intervals?: { reps: number; runMin: number; walkMin: number };
  continuousMin?: number;
  warmupMin: number;
  cooldownMin: number;
  totalMin: number;
  intensity: Intensity;
  notes: string;
}

export interface FiveKState {
  phase: 1 | 2 | 3 | 4 | 5;
  weekInPhase: number; // 1-based
  /** Phase 5 finished: maintenance runs. */
  completed?: boolean;
}

export const WEEKS_IN_PHASE: Record<FiveKState['phase'], number> = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 1 };

type Key = { reps?: number; run?: number; walk?: number; cont?: number; test?: boolean };

/** [phase][week] → [A, B] main sets. */
const TABLE: Record<number, Array<[Key, Key]>> = {
  1: [
    [{ reps: 6, run: 3, walk: 1 }, { reps: 7, run: 3, walk: 1 }],
    [{ reps: 7, run: 3, walk: 1 }, { reps: 8, run: 3, walk: 1 }],
  ],
  2: [
    [{ reps: 4, run: 5, walk: 1 }, { reps: 5, run: 5, walk: 1 }],
    [{ reps: 5, run: 5, walk: 1 }, { reps: 5, run: 5, walk: 1 }],
  ],
  3: [
    [{ reps: 3, run: 8, walk: 1 }, { reps: 3, run: 9, walk: 1 }],
    [{ reps: 3, run: 9, walk: 1 }, { reps: 3, run: 10, walk: 1 }],
  ],
  4: [
    [{ cont: 20 }, { cont: 22 }],
    [{ cont: 22 }, { cont: 25 }],
  ],
  5: [[{ cont: 25 }, { test: true, cont: 32 }]],
};

const WARMUP = 5;
const COOLDOWN = 5;

function build(slot: 'A' | 'B', k: Key, hard: boolean): RunPrescription {
  if (k.test) {
    return {
      slot,
      title: 'Test 5K',
      main: '5 km seguidos (o 30–35 min si aún no llegas a 5 km)',
      continuousMin: k.cont,
      warmupMin: WARMUP,
      cooldownMin: COOLDOWN,
      totalMin: WARMUP + k.cont! + COOLDOWN,
      intensity: hard ? 'hard' : 'moderate',
      notes: 'Sal suave los primeros 2 km; si te sobra, aprieta al final. Si hoy no toca esfuerzo, hazlo en Z2.',
    };
  }
  if (k.cont) {
    return {
      slot,
      title: slot === 'B' ? 'Tirada larga' : 'Carrera continua',
      main: `${k.cont} min seguidos`,
      continuousMin: k.cont,
      warmupMin: WARMUP,
      cooldownMin: COOLDOWN,
      totalMin: WARMUP + k.cont + COOLDOWN,
      intensity: hard ? 'hard' : 'easy',
      notes: hard
        ? 'La sesión clave de la semana: ritmo cómodo pero constante, puede acercarse a Z3 al final.'
        : 'Ritmo conversacional (Z2). Si se dispara el pulso, camina 1 min y sigue.',
    };
  }
  const runMin = k.run!;
  const walkMin = k.walk!;
  const reps = k.reps!;
  const mainMin = reps * (runMin + walkMin);
  return {
    slot,
    title: slot === 'B' ? 'Intervalos largos' : 'Intervalos correr/caminar',
    main: `${reps} × (${runMin} min corriendo + ${walkMin} min caminando)`,
    intervals: { reps, runMin, walkMin },
    warmupMin: WARMUP,
    cooldownMin: COOLDOWN,
    totalMin: WARMUP + mainMin + COOLDOWN,
    intensity: hard ? 'hard' : 'easy',
    notes: hard
      ? 'La sesión más larga de la fase: mantén los tramos de carrera constantes, sin acelerar.'
      : 'Tramos de carrera a ritmo conversacional (Z2); el caminar es para recuperar, no lo saltes.',
  };
}

/** The two key sessions of a week. `allowHardB` = false when the planner can't fit a hard session. */
export function fiveKWeek(state: FiveKState, allowHardB = true): [RunPrescription, RunPrescription] {
  if (state.completed) {
    return [maintenance('A'), { ...maintenance('B'), main: '30–35 min seguidos', continuousMin: 32, totalMin: 42 }];
  }
  const weeks = TABLE[state.phase]!;
  const [a, b] = weeks[Math.min(state.weekInPhase, weeks.length) - 1]!;
  return [build('A', a, false), build('B', b, allowHardB)];
}

function maintenance(slot: 'A' | 'B'): RunPrescription {
  return {
    slot,
    title: 'Rodaje de mantenimiento',
    main: '25–30 min seguidos',
    continuousMin: 27,
    warmupMin: WARMUP,
    cooldownMin: COOLDOWN,
    totalMin: 37,
    intensity: 'easy',
    notes: '¡5K conseguido! Mantén 2–3 salidas suaves por semana.',
  };
}

/** Optional third run: always easy and short. */
export function easyThirdRun(state: FiveKState): RunPrescription {
  const continuous = state.completed || state.phase >= 4;
  return {
    slot: 'C',
    title: 'Rodaje suave (opcional)',
    main: continuous ? '15–20 min seguidos muy suave' : '20 min alternando 2 min corriendo / 1 min caminando',
    continuousMin: continuous ? 18 : undefined,
    intervals: continuous ? undefined : { reps: 7, runMin: 2, walkMin: 1 },
    warmupMin: 5,
    cooldownMin: 5,
    totalMin: continuous ? 28 : 30,
    intensity: 'easy',
    notes: 'Muy suave, Z2 bajo. Si estás cansado, cámbialo por un paseo.',
  };
}

export interface RunResult {
  slot: 'A' | 'B' | 'C';
  done: boolean;
  /** Session RPE 1–10. */
  effort?: number;
  avgHR?: number;
}

/**
 * Progression (spec 8): move on only when BOTH key sessions were done with effort ≤ 6/10 and
 * average HR ≤ the top of Z3. Otherwise the week is repeated (also when only one run fitted).
 */
export function nextFiveKState(state: FiveKState, results: ReadonlyArray<RunResult>, z3Max: number): { state: FiveKState; advanced: boolean; reason: string } {
  if (state.completed) return { state, advanced: false, reason: 'Plan completado: mantenimiento.' };
  const key = results.filter((r) => r.slot !== 'C' && r.done);
  const slots = new Set(key.map((r) => r.slot));
  if (!slots.has('A') || !slots.has('B')) {
    return { state, advanced: false, reason: 'No se completaron las 2 sesiones clave: se repite la semana.' };
  }
  const tooHard = key.find((r) => (r.effort !== undefined && r.effort > 6) || (r.avgHR !== undefined && r.avgHR > z3Max));
  if (tooHard) {
    return { state, advanced: false, reason: 'Alguna sesión costó más de 6/10 o pasó de Z3: se repite la semana.' };
  }
  if (state.weekInPhase < WEEKS_IN_PHASE[state.phase]) {
    return { state: { ...state, weekInPhase: state.weekInPhase + 1 }, advanced: true, reason: 'Semana superada.' };
  }
  if (state.phase === 5) return { state: { ...state, completed: true }, advanced: true, reason: '¡Plan 5K completado!' };
  return { state: { phase: (state.phase + 1) as FiveKState['phase'], weekInPhase: 1 }, advanced: true, reason: `Pasas a la fase ${state.phase + 1}.` };
}

export interface RecentRun {
  durationMin: number;
}

/** Starting phase from recent runs (last ~6 weeks); without data, phase 1. */
export function suggestFiveKPhase(runs: ReadonlyArray<RecentRun>): FiveKState['phase'] {
  if (runs.length < 2) return 1;
  const durations = [...runs].map((r) => r.durationMin).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)]!;
  return median >= 30 ? 2 : 1;
}
