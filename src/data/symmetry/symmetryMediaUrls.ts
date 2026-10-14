/**
 * Remote Symmetry media confirmed by a string scan of libapp.so (APK v. on disk, Oct 2026).
 * Only URLs that appear verbatim in the binary are listed here; nothing is guessed.
 *
 * Per-exercise videos and GIFs are NOT in the APK nor hardcoded in the binary: they come at
 * runtime from the authenticated `/exercise-template/list` endpoint (`techniqueVideoURL`,
 * `thumbnailURL`) — see symmetryExerciseMedia.ts. `video_angles` is only a base.
 */

export const SYMMETRY_ASSET_HOST = 'https://symmetry-assets.com/';
export const SYMMETRY_CDN = `${SYMMETRY_ASSET_HOST}public`;

/** Base prefix for exercise camera-angle videos; full paths come from the API. */
export const VIDEO_ANGLES_BASE = `${SYMMETRY_CDN}/video_angles`;

/** Exercise catalog endpoint (reachable through the Worker proxy as /symmetry/exercise-template/list). */
export const EXERCISE_TEMPLATE_LIST_PATH = '/exercise-template/list';

export type BodyScanGender = 'male' | 'female';

export const BODY_SCAN = {
  video: {
    male: `${SYMMETRY_CDN}/body_scan/animacion_bodyscan_final.mp4`,
    female: `${SYMMETRY_CDN}/body_scan/girl_animacion_bodyscan_final.mp4`,
  },
  preview: {
    default: `${SYMMETRY_CDN}/body_scan/bodyscan_preview_default.png`,
    mesh: `${SYMMETRY_CDN}/body_scan/bodyscan_preview_mesh.png`,
    muscle: `${SYMMETRY_CDN}/body_scan/bodyscan_preview_muscle.png`,
  },
  girl: {
    default: `${SYMMETRY_CDN}/body_scan/bodyscan_girl_default.png`,
    mesh: `${SYMMETRY_CDN}/body_scan/bodyscan_girl_default_mech.png`,
    muscle: `${SYMMETRY_CDN}/body_scan/bodyscan_girl_muscle.png`,
  },
  imagePreview: {
    es: `${SYMMETRY_CDN}/body_scan/bodyscan_imagepreview_spanish.png`,
    en: `${SYMMETRY_CDN}/body_scan/bodyscan_imagepreview_english.png`,
  },
} as const;

export type BodyScanLayer = 'default' | 'mesh' | 'muscle';

export function bodyScanVideo(gender: BodyScanGender): string {
  return BODY_SCAN.video[gender];
}

export function bodyScanImage(gender: BodyScanGender, layer: BodyScanLayer): string {
  return gender === 'female' ? BODY_SCAN.girl[layer] : BODY_SCAN.preview[layer];
}

/** Placeholder avatars used by Symmetry's training page (pfp1–pfp17, mixed extensions). */
const PFP_EXT: Record<number, string> = { 1: 'jpg', 2: 'jpg', 3: 'jpg', 5: 'jpeg' };

export function profilePicUrl(index: number): string {
  const n = ((Math.trunc(index) % 17) + 17) % 17 + 1;
  return `${SYMMETRY_CDN}/training_page/profile_pics/pfp${n}.${PFP_EXT[n] ?? 'png'}`;
}

/**
 * Ordered video sources for an exercise: a local file first (public/symmetry/exercise_videos),
 * then a remote URL if the exercise record carries one from the Symmetry API.
 */
export function exerciseVideoSources(
  exercise: { id?: number | string; videoUrl?: string; techniqueVideoURL?: string },
  angle: 'front' | 'side',
): string[] {
  const out: string[] = [];
  if (exercise.id !== undefined && exercise.id !== null && exercise.id !== '') {
    out.push(`symmetry/exercise_videos/${exercise.id}/${angle}.mp4`);
  }
  // Symmetry ships a single technique video per exercise; it fills the front angle only.
  const remote = angle === 'front' ? exercise.videoUrl ?? exercise.techniqueVideoURL : undefined;
  if (remote && remote.startsWith(SYMMETRY_ASSET_HOST)) out.push(remote);
  return out;
}
