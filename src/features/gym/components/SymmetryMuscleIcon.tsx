import { useEffect, useState } from 'react';
import { assetUrl } from '../../../data/symmetry/assetHelper';
import { SYMMETRY_MUSCLES } from '../../../data/symmetry/symmetryMuscles';

// Symmetry's muscle crops: inactive muscles #B0B0B0, highlighted #F9FAFB. Recoloured for the dark UI.
const INACTIVE = '#2C2C2E';
const cache = new Map<string, Promise<string | null>>();

function recolored(icon: string, accent: string): Promise<string | null> {
  const key = `${icon}|${accent}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(assetUrl(`symmetry/icons/muscles/${icon}.svg`))
      .then((r) => (r.ok ? r.text() : null))
      .then((svg) =>
        svg
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
              svg.replace(/#F9FAFB/gi, accent).replace(/#B0B0B0/gi, INACTIVE),
            )}`
          : null,
      )
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

interface Props {
  muscle: string;
  size?: number;
  accent?: string;
  radius?: number;
}

/** Square dark tile with the body region of a muscle group highlighted, as in Symmetry's "Distribución Muscular". */
export function SymmetryMuscleIcon({ muscle, size = 66, accent = '#3B82F6', radius = 14 }: Props) {
  const icon = SYMMETRY_MUSCLES[muscle]?.icon;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    if (icon) void recolored(icon, accent).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [icon, accent]);

  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        background: '#1C1C1E',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  );
}
