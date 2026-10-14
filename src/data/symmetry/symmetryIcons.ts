// Path resolution for the Symmetry icons under public/symmetry/icons.

/** Names that callers may use but whose file has a different (misspelt or legacy) name on disk. */
export const ICON_ALIASES: Record<string, string> = {
  'muscles/cuello': 'muscles/cuelo',
  'muscles/neck': 'muscles/cuelo',
  'muscles/trapecios': 'muscles/trapecio',
  'muscles/traps': 'muscles/trapecio',
  'ranking/muscle_drawer/cuello': 'ranking/muscle_drawer/cuelo',
  'ranking/muscle_drawer/neck': 'ranking/muscle_drawer/cuelo',
  'ranking/muscle_drawer/traps': 'ranking/muscle_drawer/trapecio',
  dumbbell_icon: 'dumbell_icon',
  dumbbell_empty: 'dummble_empty',
  search: 'search_icon',
};

/** Named colors used across the Symmetry screens. Any other CSS color is passed through. */
export const ICON_COLORS = {
  white: '#ffffff',
  blue: '#2563eb',
  grey: '#9ca3af',
  gold: '#f59e0b',
} as const;

export type IconColor = keyof typeof ICON_COLORS | (string & {});

/** Turns "cuello", "muscles/cuello.svg" or "symmetry/icons/muscles/cuello" into the public path. */
export function resolveIconPath(name: string): string {
  let key = name.trim().replace(/^\/+/, '').replace(/^symmetry\/icons\//, '').replace(/\.svg$/i, '');
  key = ICON_ALIASES[key] ?? key;
  return `symmetry/icons/${key}.svg`;
}

export function resolveIconColor(color: IconColor): string {
  return (ICON_COLORS as Record<string, string>)[color] ?? color;
}
