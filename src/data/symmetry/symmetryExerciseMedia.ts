import type { Muscle } from '../../domain/strength/strength';
import { getStoredSymmetryAuth, getWorkerBaseUrl } from './symmetryApi';
import { registerExtraExercises, SYMMETRY_EXERCISES, type SymmetryExercise } from './symmetryCatalog';

/**
 * Per-exercise media (GIF thumbnail, technique video, instructions) from Symmetry's
 * `/exercise-template/list`. Fetched with the user's own session and cached on the
 * device only — never bundled into the repo, so Symmetry's media is not redistributed.
 */

export interface SymmetryExerciseMedia {
  id: number;
  name: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  instructions?: string;
  focusMuscle?: string;
  secondaryMuscles: string[];
}

interface MediaCache {
  fetchedAt: number;
  items: SymmetryExerciseMedia[];
}

const STORAGE_KEY = 'symmetry_exercise_media';
const MEDIA_ORIGIN = 'https://symmetry-assets.com/';
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm)(\?|$)/i;

function safeMediaUrl(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith(MEDIA_ORIGIN) ? value : undefined;
}

/** Pure parser for the API payload; ignores anything that is not on Symmetry's asset host. */
export function parseExerciseTemplates(payload: unknown): SymmetryExerciseMedia[] {
  if (!Array.isArray(payload)) return [];
  const out: SymmetryExerciseMedia[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'number' || typeof e.name !== 'string') continue;
    const video = safeMediaUrl(e.techniqueVideoURL);
    out.push({
      id: e.id,
      name: e.name,
      thumbnailUrl: safeMediaUrl(e.thumbnailURL),
      // One template stores a GIF in the video field; only real video files count as video.
      videoUrl: video && VIDEO_EXT.test(video) ? video : undefined,
      instructions: typeof e.instructions === 'string' && e.instructions.trim() ? e.instructions.trim() : undefined,
      focusMuscle: typeof e.focusMuscleGroup === 'string' ? e.focusMuscleGroup : undefined,
      secondaryMuscles: Array.isArray(e.secondaryMuscleGroups)
        ? e.secondaryMuscleGroups.filter((m): m is string => typeof m === 'string')
        : [],
    });
  }
  return out;
}

let memo: { cache: MediaCache | null; byId: Map<number, SymmetryExerciseMedia>; extras: SymmetryExercise[] } | null =
  null;

function setMemo(cache: MediaCache | null): NonNullable<typeof memo> {
  const items = cache?.items ?? [];
  const known = new Set(SYMMETRY_EXERCISES.map((e) => e.id));
  const extras = items.filter((m) => !known.has(m.id)).map(toLibraryExercise);
  // Lets routines, the tracker and the picker resolve downloaded templates by id or name.
  registerExtraExercises(extras);
  memo = { cache, byId: new Map(items.map((m) => [m.id, m])), extras };
  return memo;
}

function load(): NonNullable<typeof memo> {
  if (memo) return memo;
  let cache: MediaCache | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as MediaCache) : null;
  } catch {
    cache = null;
  }
  return setMemo(cache);
}

/** Loads the device cache early so catalog lookups see downloaded templates. */
export function primeExerciseMedia(): void {
  load();
}

export function getExerciseMedia(id: number | string | undefined | null): SymmetryExerciseMedia | undefined {
  if (id === undefined || id === null || id === '') return undefined;
  const n = typeof id === 'number' ? id : Number(id);
  return Number.isFinite(n) ? load().byId.get(n) : undefined;
}

export function exerciseMediaInfo(): { count: number; withVideo: number; fetchedAt: number | null } {
  const { cache } = load();
  const items = cache?.items ?? [];
  return { count: items.length, withVideo: items.filter((m) => m.videoUrl).length, fetchedAt: cache?.fetchedAt ?? null };
}

export function isExerciseMediaStale(now = Date.now()): boolean {
  const { cache } = load();
  return !cache || now - cache.fetchedAt > STALE_MS;
}

/** Symmetry focusMuscleGroup → the muscle vocabulary used by symmetryCatalog.json. */
const FOCUS_TO_MUSCLE: Record<string, string> = {
  chest: 'chest',
  shoulders: 'delts',
  upper_back: 'back',
  lats: 'back',
  trapezius: 'back',
  lower_back: 'back',
  quadriceps: 'quads',
};

const PULL = new Set(['back', 'biceps', 'forearms']);
const LEGS = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']);

/** Equipment from the "(…)" suffix Symmetry puts in every template name. */
export function implementFromName(name: string): string {
  const tag = (name.match(/\(([^)]*)\)\s*$/)?.[1] ?? '').toLowerCase();
  if (/smith|multipower/.test(tag)) return 'smith';
  if (/mancuerna/.test(tag)) return 'dumbbell';
  if (/barra z|ez/.test(tag)) return 'ez_bar';
  if (/barra/.test(tag)) return 'barbell';
  if (/polea|cable/.test(tag)) return 'cable';
  if (/m[aá]quina/.test(tag)) return 'machine';
  if (/kettlebell|pesa rusa/.test(tag)) return 'kettlebell';
  if (/lastre/.test(tag)) return 'weighted_bodyweight';
  return 'no_external_load';
}

/** Maps a downloaded template to a library entry. No rank thresholds: the API does not send them. */
export function toLibraryExercise(m: SymmetryExerciseMedia): SymmetryExercise {
  const muscle = FOCUS_TO_MUSCLE[m.focusMuscle ?? ''] ?? m.focusMuscle ?? 'other';
  const implement = implementFromName(m.name);
  return {
    id: m.id,
    name: m.name,
    implement,
    category: PULL.has(muscle) ? 'pull' : LEGS.has(muscle) ? 'legs' : 'push',
    primaryMuscle: muscle as Muscle,
    loggedUnit: implement === 'dumbbell' ? 'perDumbbell' : 'total',
    loadDivisor: 1,
    rankThresholds: null,
  };
}

/** Bundled catalog (with ranks) plus every other downloaded template, sorted by name. */
export function getLibraryExercises(): SymmetryExercise[] {
  return [...SYMMETRY_EXERCISES, ...load().extras].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Downloads the catalog with the stored Symmetry session and caches it on this device. */
export async function refreshExerciseMedia(
  workerBase = getWorkerBaseUrl(),
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const auth = getStoredSymmetryAuth();
  if (!auth?.accessToken) return { ok: false, error: 'No has iniciado sesión en Symmetry' };
  try {
    const res = await fetch(`${workerBase}/symmetry/exercise-template/list`, {
      headers: { 'X-Symmetry-Auth': `Bearer ${auth.accessToken}` },
    });
    if (!res.ok) return { ok: false, error: `Error ${res.status} al descargar el catálogo` };
    const items = parseExerciseTemplates(await res.json());
    if (items.length === 0) return { ok: false, error: 'El catálogo llegó vacío' };
    const cache: MediaCache = { fetchedAt: Date.now(), items };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // Storage full or blocked: keep it in memory for this session.
    }
    setMemo(cache);
    window.dispatchEvent(new Event('symmetry-media-updated'));
    return { ok: true, count: items.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Error de red' };
  }
}
