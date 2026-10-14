import { useEffect, useState } from 'react';
import { assetUrl } from '../../../data/symmetry/assetHelper';
import { getExerciseMedia } from '../../../data/symmetry/symmetryExerciseMedia';
import { exerciseVideoSources } from '../../../data/symmetry/symmetryMediaUrls';
import { SymmetryExerciseVisual, resolveExerciseImage } from '../SymmetryExerciseVisual';

type Angle = 'front' | 'side' | 'render';

const ANGLE_LABELS: Record<Angle, string> = {
  front: 'Técnica',
  side: 'Lateral',
  render: 'Animación',
};

/**
 * Local demo videos live in public/symmetry/exercise_videos/<exerciseId>/<front|side>.mp4.
 * If the exercise carries a Symmetry CDN video URL (from the API) it is tried next;
 * when every source fails the 3D render is shown instead.
 */
export function exerciseVideoPath(exerciseId: number | string, angle: Exclude<Angle, 'render'>): string {
  return `symmetry/exercise_videos/${exerciseId}/${angle}.mp4`;
}

interface SymmetryExerciseVideoProps {
  exercise: { id?: number | string; name?: string; videoUrl?: string; techniqueVideoURL?: string };
}

export function SymmetryExerciseVideo({ exercise: rawExercise }: SymmetryExerciseVideoProps) {
  const media = getExerciseMedia(rawExercise.id);
  const exercise = { ...rawExercise, videoUrl: rawExercise.videoUrl ?? media?.videoUrl };
  const sources = {
    front: exerciseVideoSources(exercise, 'front'),
    side: exerciseVideoSources(exercise, 'side'),
  };
  const hasVideo = sources.front.length > 0 || sources.side.length > 0;
  const initialMissing = (): Set<Angle> =>
    new Set((['front', 'side'] as const).filter((a) => sources[a].length === 0));
  const [angle, setAngle] = useState<Angle>(hasVideo ? (sources.front.length ? 'front' : 'side') : 'render');
  const [missing, setMissing] = useState<Set<Angle>>(initialMissing);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setAngle(hasVideo ? (sources.front.length ? 'front' : 'side') : 'render');
    setMissing(initialMissing());
  },[exercise.id, exercise.videoUrl, exercise.techniqueVideoURL]);

  useEffect(() => {
    setPlaying(false);
    setSourceIdx(0);
  }, [angle, exercise.id]);

  const onVideoError = (a: Exclude<Angle, 'render'>) => {
    // Try the next source (local file → Symmetry CDN) before giving up on this angle.
    if (sourceIdx + 1 < sources[a].length) setSourceIdx(sourceIdx + 1);
    else markMissing(a);
  };

  const markMissing = (a: Angle) => {
    const next = new Set(missing).add(a);
    setMissing(next);
    // Jump to the next angle that may still have a video, else to the render.
    if (angle === a) setAngle(!next.has('front') ? 'front' : !next.has('side') ? 'side' : 'render');
  };

  const poster = resolveExerciseImage(exercise) ?? undefined;
  const showVideo = angle !== 'render' && !missing.has(angle) && sources[angle].length > 0;

  return (
    <div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: 20,
          overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 45%, rgba(37,99,235,.28), #0d0e12 70%)',
          border: '1px solid rgba(96,165,250,.25)',
          boxShadow: angle === 'render' ? '0 0 32px rgba(37,99,235,.35), inset 0 0 40px rgba(37,99,235,.15)' : undefined,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {showVideo ? (
          <>
            <video
              key={`${exercise.id}-${angle}-${sourceIdx}`}
              src={assetUrl(sources[angle][sourceIdx])}
              poster={poster}
              autoPlay
              loop
              muted
              playsInline
              {...{ 'webkit-playsinline': 'true' }}
              preload="auto"
              onPlaying={() => setPlaying(true)}
              onError={() => onVideoError(angle)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#ffffff' }}
            />
            {!playing && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <img src={assetUrl('symmetry/images/loading_animation.gif')} alt="" width={56} height={56} />
              </div>
            )}
          </>
        ) : (
          <SymmetryExerciseVisual exercise={exercise} variant="hero" />
        )}
      </div>

      <div role="tablist" aria-label="Ángulo" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {(Object.keys(ANGLE_LABELS) as Angle[]).map((a) => {
          const unavailable = a !== 'render' && missing.has(a);
          const selected = angle === a;
          return (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={unavailable}
              onClick={() => setAngle(a)}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: 12,
                border: selected ? 'none' : '1px solid #22252e',
                background: selected ? '#2563eb' : '#14151a',
                color: unavailable ? '#4b5563' : '#ffffff',
                fontSize: 12,
                fontWeight: 700,
                cursor: unavailable ? 'default' : 'pointer',
              }}
            >
              {ANGLE_LABELS[a]}
            </button>
          );
        })}
      </div>
      {missing.has('front') && missing.has('side') && (
        <p style={{ fontSize: 11, color: '#6b7280', margin: '8px 2px 0' }}>
          Symmetry no tiene vídeo de técnica para este ejercicio. Se muestra la animación.
        </p>
      )}
    </div>
  );
}
