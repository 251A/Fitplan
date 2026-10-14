import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AnimationItem } from 'lottie-web';
import { assetUrl } from '../../../data/symmetry/assetHelper';

/** Lottie files shipped in public/symmetry/animations. */
export const LOTTIE = {
  streakFlame: 'symmetry/animations/streak_flame_moving.json',
  streakLevelUp: 'symmetry/animations/streak_levelup.json',
  rankUp: 'symmetry/animations/lottie_rank_up_animation.json',
  sandTimer: 'symmetry/animations/sand_timer.json',
  check: 'symmetry/animations/animated_check.json',
  loading: 'symmetry/animations/loading_animation.json',
} as const;

// The light SVG-only player (~150 KB) is loaded on first use, never in the main bundle.
type LottiePlayer = typeof import('lottie-web/build/player/lottie_light').default;
let playerPromise: Promise<LottiePlayer> | null = null;
const loadPlayer = () => (playerPromise ??= import('lottie-web/build/player/lottie_light').then((m) => m.default));

const dataCache = new Map<string, Promise<unknown>>();
function loadAnimationData(url: string): Promise<unknown> {
  let p = dataCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => dataCache.delete(url));
    dataCache.set(url, p);
  }
  return p;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

interface SymmetryLottieProps {
  /** Path under public/ (e.g. LOTTIE.streakFlame). */
  src: string;
  size?: number;
  width?: number;
  height?: number;
  loop?: boolean;
  autoplay?: boolean;
  /** Shown while loading and if the animation cannot be played. */
  fallback?: ReactNode;
  onComplete?: () => void;
  title?: string;
  style?: CSSProperties;
}

export function SymmetryLottie({
  src,
  size = 48,
  width,
  height,
  loop = true,
  autoplay = true,
  fallback = null,
  onComplete,
  title,
  style,
}: SymmetryLottieProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    let anim: AnimationItem | undefined;
    let cancelled = false;
    setState('loading');

    Promise.all([loadPlayer(), loadAnimationData(assetUrl(src))])
      .then(([lottie, animationData]) => {
        if (cancelled || !ref.current) return;
        const reduced = prefersReducedMotion();
        anim = lottie.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop: reduced ? false : loop,
          autoplay: reduced ? false : autoplay,
          animationData: structuredClone(animationData),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
        });
        anim.addEventListener('DOMLoaded', () => {
          if (reduced) anim?.goToAndStop(anim.totalFrames - 1, true);
          if (!cancelled) setState('ready');
        });
        anim.addEventListener('complete', () => completeRef.current?.());
        anim.addEventListener('data_failed', () => !cancelled && setState('failed'));
      })
      .catch(() => !cancelled && setState('failed'));

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [src, loop, autoplay]);

  const w = width ?? size;
  const h = height ?? size;
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ position: 'relative', display: 'inline-block', width: w, height: h, flexShrink: 0, ...style }}
    >
      <div ref={ref} style={{ width: '100%', height: '100%', visibility: state === 'ready' ? 'visible' : 'hidden' }} />
      {state !== 'ready' && fallback !== null && (
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{fallback}</span>
      )}
    </span>
  );
}
