import { getExerciseMedia } from './symmetryExerciseMedia';

/** Symmetry muscle groups (API `focusMuscleGroup`), labels from translations/es.json `utils.muscles`. */
export const SYMMETRY_MUSCLES: Record<string, { label: string; icon?: string }> = {
  chest: { label: 'Pecho', icon: 'pecho' },
  shoulders: { label: 'Hombros', icon: 'hombros' },
  triceps: { label: 'Tríceps', icon: 'triceps' },
  biceps: { label: 'Bíceps', icon: 'biceps' },
  forearms: { label: 'Antebrazos', icon: 'antebrazos' },
  lats: { label: 'Dorsales', icon: 'dorsales' },
  upper_back: { label: 'Espalda', icon: 'espaldasuperior' },
  trapezius: { label: 'Trapecio', icon: 'trapecio' },
  lower_back: { label: 'Lumbar', icon: 'lumbar' },
  abs: { label: 'Abdominales', icon: 'abdominales' },
  quadriceps: { label: 'Cuádriceps', icon: 'cuadriceps' },
  hamstrings: { label: 'Femoral', icon: 'femorales' },
  glutes: { label: 'Glúteos', icon: 'gluteos' },
  calves: { label: 'Gemelos', icon: 'gemelos' },
  adductors: { label: 'Aductores', icon: 'aductores' },
  abductors: { label: 'Abductores', icon: 'abductores' },
  neck: { label: 'Cuello', icon: 'cuelo' },
  cardio: { label: 'Cardio' },
};

/** symmetryCatalog.json muscle vocabulary → Symmetry group, for exercises without downloaded data. */
const CATALOG_TO_SYMMETRY: Record<string, string> = { quads: 'quadriceps', delts: 'shoulders', back: 'lats' };

export interface ExerciseMuscles {
  focus: string;
  secondary: string[];
}

export function exerciseMuscles(exercise: { id?: number | string; primaryMuscle?: string }): ExerciseMuscles {
  const media = getExerciseMedia(exercise.id);
  if (media?.focusMuscle) {
    return { focus: media.focusMuscle, secondary: media.secondaryMuscles.filter((m) => m !== media.focusMuscle) };
  }
  const p = exercise.primaryMuscle ?? '';
  return { focus: CATALOG_TO_SYMMETRY[p] ?? p, secondary: [] };
}

export function muscleLabel(key: string): string {
  return SYMMETRY_MUSCLES[key]?.label ?? key;
}

/** "Cuádriceps, Glúteos, Femoral, Aductores" — focus first, as Symmetry lists them. */
export function musclesText(m: ExerciseMuscles): string {
  return [m.focus, ...m.secondary].filter(Boolean).map(muscleLabel).join(', ');
}

export interface MuscleShare {
  key: string;
  label: string;
  percent: number;
}

/** Share of the session per muscle: focus counts 1, each secondary 0.5. Sorted, rounded to whole %. */
export function muscleDistribution(list: ReadonlyArray<ExerciseMuscles>): MuscleShare[] {
  const score = new Map<string, number>();
  for (const m of list) {
    if (!m.focus) continue;
    score.set(m.focus, (score.get(m.focus) ?? 0) + 1);
    for (const s of m.secondary) score.set(s, (score.get(s) ?? 0) + 0.5);
  }
  const total = [...score.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return [...score.entries()]
    .map(([key, v]) => ({ key, label: muscleLabel(key), percent: Math.round((v / total) * 100) }))
    .sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label, 'es'));
}
