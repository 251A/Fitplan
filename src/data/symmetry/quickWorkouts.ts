import quickWorkoutsData from './quickWorkouts.json';

export interface QuickWorkoutExercise {
  exerciseTemplateId: number;
  name: string;
  numberOfSets: number;
  repsPerSet: number;
  restTimeInBetweenSets: number;
  note: string | null;
}

export interface QuickWorkout {
  id: string;
  muscleGroupId: string;
  name: string;
  thumbnailUrl: string;
  durationMinutes: number;
  equipmentVersion: 'gym_small' | 'home';
  level: 'beginner' | 'intermediate' | 'advanced';
  exercises: QuickWorkoutExercise[];
}

export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  arms: 'Brazos',
  chest: 'Pecho',
  back: 'Espalda',
  legs: 'Piernas',
  shoulders: 'Hombros',
  glutes: 'Glúteos',
  core: 'Abdomen / Core',
  upper_body: 'Torso',
  full_body: 'Cuerpo Completo',
  push: 'Empuje',
  pull: 'Tracción',
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

export const EQUIPMENT_LABELS: Record<string, string> = {
  gym_small: 'Gimnasio',
  home: 'En Casa',
};

interface RawWorkout {
  name: string;
  thumbnailUrl: string;
  durationMinutes: number;
  equipmentVersion: string;
  level: string;
  exercises: Array<{
    exerciseTemplateId: number;
    name: string;
    numberOfSets: number;
    repsPerSet: number;
    restTimeInBetweenSets: number;
    note: string | null;
  }>;
}

interface RawGroup {
  id: string;
  workouts: RawWorkout[];
}

const ALL_QUICK_WORKOUTS: QuickWorkout[] = (() => {
  const result: QuickWorkout[] = [];
  const rawGroups = (quickWorkoutsData as { muscleGroups: RawGroup[] }).muscleGroups || [];
  for (const group of rawGroups) {
    const workouts = group.workouts || [];
    workouts.forEach((w, idx) => {
      result.push({
        id: `${group.id}-${idx}`,
        muscleGroupId: group.id,
        name: w.name,
        thumbnailUrl: w.thumbnailUrl,
        durationMinutes: w.durationMinutes,
        equipmentVersion: w.equipmentVersion === 'home' ? 'home' : 'gym_small',
        level:
          w.level === 'advanced'
            ? 'advanced'
            : w.level === 'intermediate'
              ? 'intermediate'
              : 'beginner',
        exercises: w.exercises.map((e) => ({
          exerciseTemplateId: e.exerciseTemplateId,
          name: e.name,
          numberOfSets: e.numberOfSets,
          repsPerSet: e.repsPerSet,
          restTimeInBetweenSets: e.restTimeInBetweenSets,
          note: e.note,
        })),
      });
    });
  }
  return result;
})();

export function getAllQuickWorkouts(): QuickWorkout[] {
  return ALL_QUICK_WORKOUTS;
}

export function getQuickWorkoutsByGroup(groupId?: string): QuickWorkout[] {
  if (!groupId || groupId === 'all') return ALL_QUICK_WORKOUTS;
  return ALL_QUICK_WORKOUTS.filter((w) => w.muscleGroupId === groupId);
}
