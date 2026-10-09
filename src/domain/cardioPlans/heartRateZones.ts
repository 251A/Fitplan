// Karvonen heart-rate zones (spec section 8): HRR = HRmax − HRrest; zone bound = HRrest + pct × HRR.

export interface HrZone {
  zone: 1 | 2 | 3 | 4 | 5;
  min: number;
  max: number;
}

const BOUNDS: Array<[HrZone['zone'], number, number]> = [
  [1, 0.5, 0.6],
  [2, 0.6, 0.7],
  [3, 0.7, 0.8],
  [4, 0.8, 0.9],
  [5, 0.9, 1.0],
];

export function karvonenZones(hrMax: number, hrRest: number): HrZone[] {
  const hrr = hrMax - hrRest;
  return BOUNDS.map(([zone, lo, hi]) => ({ zone, min: Math.round(hrRest + lo * hrr), max: Math.round(hrRest + hi * hrr) }));
}

export function zone(hrMax: number, hrRest: number, z: HrZone['zone']): HrZone {
  return karvonenZones(hrMax, hrRest)[z - 1]!;
}
