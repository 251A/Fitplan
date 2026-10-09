// Repairs "mojibake": UTF-8 text that was once read as Windows-1252 ("TracciÃ³n" → "Tracción").
// Happened to the first exercise library / personal seed; kept as a one-off startup migration.

const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98,
  0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f,
};

export function repairMojibake(s: string): string {
  if (!/[ÃÂ]/.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 256) bytes.push(c);
    else if (CP1252[c] !== undefined) bytes.push(CP1252[c]!);
    else return s;
  }
  const out = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  return out.includes('�') ? s : out;
}

/** Deeply repairs every string; returns undefined when nothing changed. */
export function repairDeep<T>(value: T): T | undefined {
  let changed = false;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = repairMojibake(v);
      if (r !== v) changed = true;
      return r;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const out = walk(value) as T;
  return changed ? out : undefined;
}
