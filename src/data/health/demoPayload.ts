// Synthetic Health data for developing in the desktop browser (never used in production builds).

import type { RawHealthPayload } from './payload';

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

export function buildDemoPayload(now: Date, days = 35): RawHealthPayload {
  const r = rng(42);
  const p: Required<Pick<RawHealthPayload, 'steps' | 'sleep' | 'hrv' | 'restingHR' | 'bodyMass' | 'workouts'>> = {
    steps: [],
    sleep: [],
    hrv: [],
    restingHR: [],
    bodyMass: [],
    workouts: [],
  };
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const date = iso(day).slice(0, 10);
    p.steps.push({ date, value: i === 0 ? Math.round(4000 + r() * 4000) : Math.round(9000 + r() * 11000) });

    const bed = new Date(day.getTime() - (60 + r() * 90) * 60_000); // 22:30–00:00 previous evening
    const hours = 6.3 + r() * 2.2;
    const wake = new Date(bed.getTime() + hours * 3600_000);
    p.sleep.push({ start: iso(bed), end: iso(wake), value: 'Dormido', source: 'iPhone' });
    p.sleep.push({ start: iso(new Date(bed.getTime() + 15 * 60_000)), end: iso(wake), value: 'Núcleo', source: 'Apple Watch' });

    p.hrv.push({ start: iso(new Date(bed.getTime() + 2 * 3600_000)), value: (55 + r() * 20).toFixed(1).replace('.', ',') });
    p.restingHR.push({ start: `${date}T00:00:00`, value: String(Math.round(60 + r() * 7)) });
    if (i % 3 === 0) p.bodyMass.push({ start: `${date}T07:30:00`, value: (75 - (days - i) * 0.02).toFixed(1).replace('.', ',') });
    if (i % 2 === 1) {
      const start = new Date(day.getTime() + 18 * 3600_000);
      p.workouts.push({
        start: iso(start),
        end: iso(new Date(start.getTime() + 50 * 60_000)),
        type: i % 4 === 1 ? 'Carrera' : 'Entrenamiento de fuerza tradicional',
        source: i % 4 === 1 ? 'Runna' : 'Symmetry',
        distanceM: i % 4 === 1 ? 3500 : undefined,
      });
    }
  }
  return { version: 1, generatedAt: iso(now), ...p };
}
