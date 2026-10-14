import React, { useState } from 'react';
import type { SymmetryExercise } from '../../data/symmetry/symmetryCatalog';
import { assetUrl } from '../../data/symmetry/assetHelper';
import { getExerciseMedia } from '../../data/symmetry/symmetryExerciseMedia';

// Known authentic cropped illustrations from Symmetry
const KNOWN_EXERCISE_IMAGES: Record<string, string> = {
  // By ID or slug
  '19': 'symmetry/exercises/ex_jalon_prono.png',
  'jalon_prono': 'symmetry/exercises/ex_jalon_prono.png',
  'jalon_cerrado': 'symmetry/exercises/ex_jalon_cerrado.png',
  'remo_neutro': 'symmetry/exercises/ex_remo_neutro.png',
  'curl_biceps': 'symmetry/exercises/ex_curl_biceps.png',
  '26': 'symmetry/exercises/ex_curl_biceps.png',
  '8': 'symmetry/exercises/ex_press_banca.png',
  'press_banca': 'symmetry/exercises/ex_press_banca.png',
  '14': 'symmetry/exercises/ex_press_inclinado.png',
  'press_inclinado': 'symmetry/exercises/ex_press_inclinado.png',
  '17': 'symmetry/exercises/ex_pec_deck.png',
  'pec_deck': 'symmetry/exercises/ex_pec_deck.png',
  'cruces_polea': 'symmetry/exercises/ex_cruces_polea.png',
  '2': 'symmetry/exercises/ex_prensa_45.png',
  'prensa_45': 'symmetry/exercises/ex_prensa_45.png',
  'curl_femoral': 'symmetry/exercises/ex_curl_femoral.png',
  '6': 'symmetry/exercises/ex_extension_cuadriceps.png',
  'extension_cuadriceps': 'symmetry/exercises/ex_extension_cuadriceps.png',
  'sentadilla_hack': 'symmetry/exercises/ex_sentadilla_hack.png',
  '1': 'symmetry/exercises/ex_sentadilla_hack.png',
};

// Known routine 2x2 collage images
export const ROUTINE_COLLAGES: Record<string, string> = {
  'traccion_a': 'symmetry/exercises/routine_traccion_a.png',
  'empuje_a': 'symmetry/exercises/routine_empuje_a.png',
  'pierna': 'symmetry/exercises/routine_pierna.png',
  'traccion_b': 'symmetry/exercises/routine_traccion_b.png',
  'empuje_b': 'symmetry/exercises/routine_empuje_b.png',
};

// Known 3D hero renders with glowing blue muscles
export const HERO_RENDERS: Record<string, string> = {
  '19': 'symmetry/exercises/hero_jalon_prono.png',
  'jalon_prono': 'symmetry/exercises/hero_jalon_prono.png',
  'jalon_cerrado': 'symmetry/exercises/hero_jalon_cerrado.png',
  'remo_neutro': 'symmetry/exercises/bubble_remo_neutro.png',
  'curl_biceps': 'symmetry/exercises/hero_jalon_prono.png',
};

/**
 * Returns initials of exercise name formatted like Symmetry
 * e.g. "Curl de Concentración con Agarre Inverso" -> "CDCCAI"
 */
export function getExerciseInitials(name: string): string {
  if (!name) return 'EX';
  const clean = name.replace(/\([^)]*\)/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const firstWord = words[0];
  if (words.length === 1 && firstWord) return firstWord.slice(0, 3).toUpperCase();
  return words
    .map((w) => (w && w[0] ? w[0].toUpperCase() : ''))
    .join('')
    .slice(0, 6);
}

/**
 * Finds a matching image URL for an exercise by ID or name
 */
export function resolveExerciseImage(
  exercise?: Partial<SymmetryExercise> | { id?: number | string; name?: string },
): string | null {
  if (!exercise) return null;

  // Real Symmetry GIF for this exact template, when the catalog has been downloaded.
  const media = getExerciseMedia(exercise.id);
  if (media?.thumbnailUrl) return media.thumbnailUrl;

  if (exercise.id != null) {
    const byId = KNOWN_EXERCISE_IMAGES[String(exercise.id)];
    if (byId) return assetUrl(byId);
  }

  const name = (exercise.name || '').toLowerCase();
  if (name.includes('prono') && name.includes('jal')) return assetUrl(KNOWN_EXERCISE_IMAGES['jalon_prono'] ?? null);
  if (name.includes('cerrado') && name.includes('jal')) return assetUrl(KNOWN_EXERCISE_IMAGES['jalon_cerrado'] ?? null);
  if (name.includes('jalón') || name.includes('jalon') || name.includes('pulldown')) return assetUrl(KNOWN_EXERCISE_IMAGES['jalon_prono'] ?? null);
  if (name.includes('remo') || name.includes('row')) return assetUrl(KNOWN_EXERCISE_IMAGES['remo_neutro'] ?? null);
  if (name.includes('curl') || name.includes('bíc') || name.includes('bic')) return assetUrl(KNOWN_EXERCISE_IMAGES['curl_biceps'] ?? null);
  if (name.includes('banca plano') || name.includes('banca barra') || name.includes('press banca')) return assetUrl(KNOWN_EXERCISE_IMAGES['press_banca'] ?? null);
  if (name.includes('banca inclinado') || name.includes('press inclinado') || name.includes('militar') || name.includes('hombro') || name.includes('press')) return assetUrl(KNOWN_EXERCISE_IMAGES['press_inclinado'] ?? null);
  if (name.includes('pec deck') || name.includes('apertura') || name.includes('lateral') || name.includes('pájaro') || name.includes('pajaro')) return assetUrl(KNOWN_EXERCISE_IMAGES['pec_deck'] ?? null);
  if (name.includes('cruce') || name.includes('polea') || name.includes('tríceps') || name.includes('triceps') || name.includes('katana')) return assetUrl(KNOWN_EXERCISE_IMAGES['cruces_polea'] ?? null);
  if (name.includes('prensa 45') || name.includes('prensa')) return assetUrl(KNOWN_EXERCISE_IMAGES['prensa_45'] ?? null);
  if (name.includes('extensión de rodilla') || name.includes('cuádriceps') || name.includes('cuadriceps')) return assetUrl(KNOWN_EXERCISE_IMAGES['extension_cuadriceps'] ?? null);
  if (name.includes('sentadilla') || name.includes('squat') || name.includes('hack') || name.includes('búlgara') || name.includes('bulgara')) return assetUrl(KNOWN_EXERCISE_IMAGES['sentadilla_hack'] ?? null);
  if (name.includes('femoral') || name.includes('peso muerto') || name.includes('isquios')) return assetUrl(KNOWN_EXERCISE_IMAGES['curl_femoral'] ?? null);
  if (name.includes('hip thrust') || name.includes('abducci') || name.includes('aducci') || name.includes('glúte') || name.includes('glute')) return assetUrl(KNOWN_EXERCISE_IMAGES['prensa_45'] ?? null);

  return null;
}

interface SymmetryExerciseVisualProps {
  exercise?: Partial<SymmetryExercise> | { id?: number | string; name?: string };
  variant?: 'thumbnail' | 'circular' | 'hero';
  size?: number;
  active?: boolean;
  className?: string;
  onClick?: () => void;
}

export const SymmetryExerciseVisual: React.FC<SymmetryExerciseVisualProps> = ({
  exercise,
  variant = 'thumbnail',
  size,
  active = false,
  className = '',
  onClick,
}) => {
  const [loadError, setLoadError] = useState(false);
  const name = exercise?.name || '';
  const imgUrl = resolveExerciseImage(exercise);
  const initials = getExerciseInitials(name);

  React.useEffect(() => {
    setLoadError(false);
  }, [imgUrl]);

  // 1. CIRCULAR BUBBLE (guided workout top carousel or PRs row)
  if (variant === 'circular') {
    const dim = size || 58;
    return (
      <div
        className={`sym-bubble-wrap ${active ? 'active' : ''} ${className}`}
        onClick={onClick}
        style={{
          width: dim,
          height: dim,
          minWidth: dim,
          minHeight: dim,
          borderRadius: '50%',
          boxSizing: 'border-box',
          border: active ? '2px solid #ffffff' : '1.5px solid rgba(255,255,255,0.15)',
          background: '#090a0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          opacity: active ? 1 : 0.65,
        }}
      >
        {imgUrl && !loadError ? (
          <img
            src={imgUrl}
            alt={name}
            onError={() => setLoadError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: '#ffffff',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: '#13151a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: initials.length > 4 ? 10 : 12,
              letterSpacing: 0.5,
            }}
          >
            {initials}
          </div>
        )}
      </div>
    );
  }

  // 2. HERO GRAPHIC (center live workout render)
  if (variant === 'hero') {
    const heroKey =
      (exercise?.id && HERO_RENDERS[String(exercise.id)]) ||
      (name.includes('cerrado') ? HERO_RENDERS['jalon_cerrado'] : HERO_RENDERS['jalon_prono']);
    const heroImg = assetUrl(heroKey);

    return (
      <div
        className={`sym-hero-render-wrap ${className}`}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 340,
          aspectRatio: '1 / 1',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!loadError ? (
          <img
            src={heroImg}
            alt={name}
            onError={() => setLoadError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.8))',
            }}
          />
        ) : (
          <div
            role="img"
            aria-label={name || 'Ejercicio'}
            style={{
              width: '72%',
              aspectRatio: '1',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              color: '#ffffff',
              fontFamily: 'Albert Sans, sans-serif',
              fontSize: 36,
              fontWeight: 800,
              background: 'radial-gradient(circle, rgba(59,130,246,.35), rgba(19,21,26,.96) 72%)',
              border: '1px solid rgba(96,165,250,.35)',
              boxShadow: '0 0 36px rgba(59,130,246,.2)',
            }}
          >
            {initials}
          </div>
        )}

        {/* Floating blue Symmetry 'S' badge (matching screenshot 8 & 9) */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 18,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={assetUrl('symmetry/symmetry_letters_logo.svg')}
            alt="Symmetry"
            style={{ width: 22, height: 22, filter: 'brightness(0) invert(1)' }}
          />
        </div>
      </div>
    );
  }

  // 3. THUMBNAIL (white squircle matching screenshot 7)
  const dim = size || 56;
  return (
    <div
      className={`sym-exercise-squircle-wrap ${className}`}
      style={{
        width: dim,
        height: dim,
        minWidth: dim,
        minHeight: dim,
        borderRadius: 14,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      }}
    >
      {imgUrl && !loadError ? (
        <img
          src={imgUrl}
          alt={name}
          onError={() => setLoadError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <span
          style={{
            color: '#000000',
            fontWeight: 900,
            fontSize: initials.length > 5 ? 11 : initials.length > 3 ? 13 : 15,
            letterSpacing: '-0.2px',
            userSelect: 'none',
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
};
