import type { CSSProperties } from 'react';
import { assetUrl } from '../../../data/symmetry/assetHelper';
import { resolveIconColor, resolveIconPath, type IconColor } from '../../../data/symmetry/symmetryIcons';

interface SymmetryIconProps {
  /** Path under public/symmetry/icons, with or without ".svg" (aliases such as "muscles/cuello" are resolved). */
  name: string;
  size?: number;
  /** Tint for monochrome icons. Ignored in "original" mode. */
  color?: IconColor;
  /**
   * "mask" paints the icon shape with `color`, whatever fill the SVG uses (black, currentColor…).
   * "original" keeps the SVG colors (rank badges, multicolor art).
   */
  mode?: 'mask' | 'original';
  /** Accessible label; decorative when omitted. */
  title?: string;
  style?: CSSProperties;
}

export function SymmetryIcon({ name, size = 22, color = 'white', mode = 'mask', title, style }: SymmetryIconProps) {
  const url = assetUrl(resolveIconPath(name));
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };

  if (mode === 'original') {
    return <img src={url} alt={title ?? ''} width={size} height={size} style={{ objectFit: 'contain', flexShrink: 0, ...style }} />;
  }

  const mask = `url("${url}") center / contain no-repeat`;
  return (
    <span
      {...a11y}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: resolveIconColor(color),
        WebkitMask: mask,
        mask,
        ...style,
      }}
    />
  );
}
