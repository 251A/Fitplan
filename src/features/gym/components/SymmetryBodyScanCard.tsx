import { useState } from 'react';
import { bodyScanImage, bodyScanVideo, type BodyScanGender } from '../../../data/symmetry/symmetryMediaUrls';

const GENDER_LABELS: Record<BodyScanGender, string> = { male: 'Hombre', female: 'Mujer' };

/** Body Scan preview: Symmetry's scanning animation streamed from its CDN, with a static fallback. */
export function SymmetryBodyScanCard() {
  const [gender, setGender] = useState<BodyScanGender>('male');
  const [failed, setFailed] = useState<Set<BodyScanGender>>(() => new Set());
  const videoFailed = failed.has(gender);

  return (
    <div
      style={{
        borderRadius: 18,
        background: '#121317',
        border: '1px solid #1f2127',
        padding: 12,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Body Scan</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(GENDER_LABELS) as BodyScanGender[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              aria-pressed={gender === g}
              style={{
                padding: '4px 10px',
                borderRadius: 12,
                border: gender === g ? 'none' : '1px solid #22252e',
                background: gender === g ? '#2563eb' : '#14151a',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {GENDER_LABELS[g]}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          borderRadius: 14,
          overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 40%, rgba(37,99,235,.25), #0b0c10 70%)',
        }}
      >
        {videoFailed ? (
          <img
            src={bodyScanImage(gender, 'muscle')}
            alt="Vista previa del escaneo corporal"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <video
            key={gender}
            src={bodyScanVideo(gender)}
            poster={bodyScanImage(gender, 'default')}
            autoPlay
            loop
            muted
            playsInline
            {...{ 'webkit-playsinline': 'true' }}
            preload="metadata"
            onError={() => setFailed((prev) => new Set(prev).add(gender))}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
      <p style={{ fontSize: 10, color: '#6b7280', margin: '8px 2px 0' }}>
        Animación de Symmetry (necesita conexión). El análisis real del escaneo no está disponible en FitPlan.
      </p>
    </div>
  );
}
