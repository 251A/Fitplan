/**
 * Safely resolves static assets with the correct base path so they work
 * seamlessly in:
 * - Local development (http://localhost:5173/)
 * - GitHub Pages subpath deployment (https://251A.github.io/Fitplan/ or /Fitplan)
 * - Standalone iOS PWA / Home Screen webapp
 * - Cloudflare Pages / custom domains
 */
export function getAppBase(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  // On github.io, the first pathname segment is the repository name (e.g. /Fitplan/)
  if (hostname.endsWith('github.io')) {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      return `/${segments[0]}/`;
    }
    return '/Fitplan/';
  }

  // Fallback to Vite base or directory path
  const rawBase = import.meta.env.BASE_URL || '/';
  if (rawBase === './' || rawBase === '.') {
    const dir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
    return dir || '/';
  }

  return rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
}

export function assetUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }

  // Strip leading slashes
  const clean = path.replace(/^\/+/, '');
  const base = getAppBase();
  return `${base}${clean}`;
}
