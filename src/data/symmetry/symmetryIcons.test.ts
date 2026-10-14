import { describe, expect, it } from 'vitest';
import { resolveIconColor, resolveIconPath } from './symmetryIcons';

describe('resolveIconPath', () => {
  it('normalizes prefixes and extensions', () => {
    expect(resolveIconPath('icon_streak')).toBe('symmetry/icons/icon_streak.svg');
    expect(resolveIconPath('/symmetry/icons/streak/flame_lit.svg')).toBe('symmetry/icons/streak/flame_lit.svg');
  });

  it('redirects misspelt files to the names on disk', () => {
    expect(resolveIconPath('muscles/cuello')).toBe('symmetry/icons/muscles/cuelo.svg');
    expect(resolveIconPath('ranking/muscle_drawer/cuello.svg')).toBe('symmetry/icons/ranking/muscle_drawer/cuelo.svg');
    expect(resolveIconPath('dumbbell_icon')).toBe('symmetry/icons/dumbell_icon.svg');
  });
});

describe('resolveIconColor', () => {
  it('maps named colors and passes CSS colors through', () => {
    expect(resolveIconColor('blue')).toBe('#2563eb');
    expect(resolveIconColor('#123456')).toBe('#123456');
  });
});
