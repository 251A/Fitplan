// Gym templates by number of days (spec 6, step 1), built from the user's exercise library.
// Loads are never decided here: the app shows the last weight used for each exercise.

export type MuscleGroup = 'push' | 'pull' | 'legs';

export type GymTemplateName =
  | 'Empuje A'
  | 'Tracción A'
  | 'Pierna'
  | 'Empuje B'
  | 'Tracción B'
  | 'Empuje'
  | 'Tracción'
  | 'Tren superior'
  | 'Cuerpo completo'
  | 'Cuerpo completo A'
  | 'Cuerpo completo B';

export interface TemplateExercise {
  exerciseId: string;
  sets: number;
  reps: string; // rep range, e.g. "8–12"
}

export interface GymTemplate {
  name: GymTemplateName;
  groups: MuscleGroup[];
  minutes: number;
  exercises: TemplateExercise[];
}

const ex = (exerciseId: string, sets: number, reps = '8–12'): TemplateExercise => ({ exerciseId, sets, reps });

export const TEMPLATES: Record<GymTemplateName, GymTemplate> = {
  'Empuje A': {
    name: 'Empuje A',
    groups: ['push'],
    minutes: 60,
    exercises: [
      ex('bench-press-barbell', 4, '6–10'),
      ex('incline-press-smith', 3),
      ex('shoulder-press-machine', 3),
      ex('lateral-raise-machine', 3, '12–18'),
      ex('pec-deck', 3, '10–15'),
      ex('triceps-pushdown-straight', 3, '10–15'),
    ],
  },
  'Empuje B': {
    name: 'Empuje B',
    groups: ['push'],
    minutes: 60,
    exercises: [
      ex('incline-press-smith', 4, '6–10'),
      ex('bench-press-barbell', 3),
      ex('lateral-raise-seated-db', 3, '12–15'),
      ex('shoulder-press-machine', 3),
      ex('pec-deck', 2, '10–15'),
      ex('katana-extension-single', 3, '10–15'),
    ],
  },
  'Tracción A': {
    name: 'Tracción A',
    groups: ['pull'],
    minutes: 60,
    exercises: [
      ex('lat-pulldown-pronated', 4, '6–10'),
      ex('row-neutral-machine', 3),
      ex('lat-pulldown-close', 3),
      ex('reverse-fly-incline-db', 3, '12–15'),
      ex('incline-curl-db', 3),
      ex('hammer-curl-seated-db', 2),
    ],
  },
  'Tracción B': {
    name: 'Tracción B',
    groups: ['pull'],
    minutes: 60,
    exercises: [
      ex('lat-pulldown-neutral-wide', 4, '6–10'),
      ex('row-neutral-machine', 3),
      ex('lat-pulldown-pronated', 3),
      ex('cable-curl', 3),
      ex('preacher-curl-single-db', 2),
      ex('concentration-curl-reverse', 2, '12–15'),
    ],
  },
  Pierna: {
    name: 'Pierna',
    groups: ['legs'],
    minutes: 55,
    exercises: [
      ex('leg-press-45', 4, '8–12'),
      ex('lying-leg-curl-db', 3),
      ex('leg-extension', 3, '10–15'),
      ex('hip-thrust-machine', 3),
      ex('hip-abduction', 3, '12–15'),
    ],
  },
  Empuje: {
    name: 'Empuje',
    groups: ['push'],
    minutes: 60,
    exercises: [
      ex('bench-press-barbell', 4, '6–10'),
      ex('incline-press-smith', 3),
      ex('shoulder-press-machine', 3),
      ex('lateral-raise-machine', 3, '12–18'),
      ex('triceps-pushdown-straight', 3, '10–15'),
    ],
  },
  Tracción: {
    name: 'Tracción',
    groups: ['pull'],
    minutes: 60,
    exercises: [
      ex('lat-pulldown-pronated', 4, '6–10'),
      ex('row-neutral-machine', 3),
      ex('lat-pulldown-neutral-wide', 3),
      ex('reverse-fly-incline-db', 2, '12–15'),
      ex('incline-curl-db', 3),
    ],
  },
  'Tren superior': {
    name: 'Tren superior',
    groups: ['push', 'pull'],
    minutes: 65,
    exercises: [
      ex('bench-press-barbell', 3, '6–10'),
      ex('lat-pulldown-pronated', 3, '6–10'),
      ex('incline-press-smith', 3),
      ex('row-neutral-machine', 3),
      ex('lateral-raise-machine', 2, '12–18'),
      ex('incline-curl-db', 2),
      ex('triceps-pushdown-straight', 2, '10–15'),
    ],
  },
  'Cuerpo completo': {
    name: 'Cuerpo completo',
    groups: ['push', 'pull', 'legs'],
    minutes: 65,
    exercises: [
      ex('leg-press-45', 3),
      ex('bench-press-barbell', 3, '6–10'),
      ex('lat-pulldown-pronated', 3),
      ex('lying-leg-curl-db', 3),
      ex('row-neutral-machine', 2),
      ex('lateral-raise-machine', 2, '12–18'),
    ],
  },
  'Cuerpo completo A': {
    name: 'Cuerpo completo A',
    groups: ['push', 'pull', 'legs'],
    minutes: 65,
    exercises: [
      ex('leg-press-45', 3),
      ex('bench-press-barbell', 3, '6–10'),
      ex('lat-pulldown-pronated', 3),
      ex('lying-leg-curl-db', 3),
      ex('lateral-raise-machine', 2, '12–18'),
      ex('incline-curl-db', 2),
    ],
  },
  'Cuerpo completo B': {
    name: 'Cuerpo completo B',
    groups: ['push', 'pull', 'legs'],
    minutes: 65,
    exercises: [
      ex('incline-press-smith', 3, '6–10'),
      ex('row-neutral-machine', 3),
      ex('leg-press-45', 3),
      ex('leg-extension', 2, '10–15'),
      ex('lat-pulldown-neutral-wide', 2),
      ex('triceps-pushdown-straight', 2, '10–15'),
    ],
  },
};

export type ThreeDayTemplate = 'upperLowerFull' | 'pushPullLegs';

/** Session list for a number of gym days (spec 6, step 1). */
export function templatesForDays(days: number, threeDay: ThreeDayTemplate): GymTemplateName[] {
  switch (Math.max(0, Math.min(5, days))) {
    case 5:
      return ['Empuje A', 'Tracción A', 'Pierna', 'Empuje B', 'Tracción B'];
    case 4:
      return ['Empuje', 'Tracción', 'Pierna', 'Tren superior'];
    case 3:
      return threeDay === 'pushPullLegs' ? ['Empuje', 'Tracción', 'Pierna'] : ['Tren superior', 'Pierna', 'Cuerpo completo'];
    case 2:
      return ['Cuerpo completo A', 'Cuerpo completo B'];
    case 1:
      return ['Cuerpo completo'];
    default:
      return [];
  }
}

export const trainsLegs = (name: GymTemplateName) => TEMPLATES[name].groups.includes('legs');
