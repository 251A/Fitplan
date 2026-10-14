import { describe, expect, it } from 'vitest';
import { implementFromName, parseExerciseTemplates, toLibraryExercise } from './symmetryExerciseMedia';

describe('library mapping', () => {
  it('derives equipment from the name suffix', () => {
    expect(implementFromName('Press Inclinado (Smith)')).toBe('smith');
    expect(implementFromName('Curl Martillo (Mancuerna)')).toBe('dumbbell');
    expect(implementFromName('Remo (Barra)')).toBe('barbell');
    expect(implementFromName('Jalón (Polea)')).toBe('cable');
    expect(implementFromName('Extensión De Rodilla (Máquina)')).toBe('machine');
    expect(implementFromName('Dominadas')).toBe('no_external_load');
  });

  it('maps focus muscle and category, without ranks', () => {
    const ex = toLibraryExercise({ id: 900, name: 'Remo Alto (Polea)', focusMuscle: 'upper_back', secondaryMuscles: [] });
    expect(ex).toMatchObject({ id: 900, implement: 'cable', primaryMuscle: 'back', category: 'pull', rankThresholds: null });
    expect(toLibraryExercise({ id: 901, name: 'Aductor (Máquina)', focusMuscle: 'adductors', secondaryMuscles: [] }).category).toBe('legs');
  });
});

describe('parseExerciseTemplates', () => {
  it('keeps id, media, instructions and muscles from a template', () => {
    const [m] = parseExerciseTemplates([
      {
        id: 9,
        name: 'Elevaciones Laterales (Mancuerna)',
        thumbnailURL: 'https://symmetry-assets.com/exercises/abc.gif',
        techniqueVideoURL: 'https://symmetry-assets.com/exercises/v2/Elevaciones_Laterales.mp4',
        instructions: ' 1. De pie. ',
        focusMuscleGroup: 'shoulders',
        secondaryMuscleGroups: ['trapezius'],
      },
    ]);
    expect(m).toEqual({
      id: 9,
      name: 'Elevaciones Laterales (Mancuerna)',
      thumbnailUrl: 'https://symmetry-assets.com/exercises/abc.gif',
      videoUrl: 'https://symmetry-assets.com/exercises/v2/Elevaciones_Laterales.mp4',
      instructions: '1. De pie.',
      focusMuscle: 'shoulders',
      secondaryMuscles: ['trapezius'],
    });
  });

  it('drops GIFs stored as video and URLs from other hosts', () => {
    const [m] = parseExerciseTemplates([
      {
        id: 1,
        name: 'X',
        thumbnailURL: 'https://evil.example/x.gif',
        techniqueVideoURL: 'https://symmetry-assets.com/exercises/x.gif',
        secondaryMuscleGroups: null,
      },
    ]);
    expect(m?.thumbnailUrl).toBeUndefined();
    expect(m?.videoUrl).toBeUndefined();
    expect(m?.secondaryMuscles).toEqual([]);
  });

  it('ignores malformed payloads', () => {
    expect(parseExerciseTemplates({ results: [] })).toEqual([]);
    expect(parseExerciseTemplates([null, { id: 'a', name: 'b' }])).toEqual([]);
  });
});
