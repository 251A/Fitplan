// What Claude extracts from ONE Symmetry screenshot (spec 7.1), plus its JSON schema and a
// hand-written validator (the "Codable" check): the model output is never trusted blindly.

export interface ExtractedSet {
  index: number;
  weight_kg: number;
  reps: number;
}

export interface ExtractedExercise {
  name: string;
  sets: ExtractedSet[];
  /** The block starts above the visible area (its first sets are on the previous screenshot). */
  cut_at_top: boolean;
  /** The block continues below the visible area (next screenshot). */
  cut_at_bottom: boolean;
}

export interface ExtractedHeader {
  date: string | null; // ISO yyyy-mm-dd
  name: string | null;
  duration_min: number | null;
  volume_kg: number | null;
  sets_total: number | null;
}

export interface ExtractedPage {
  /** detail = "Detalle de Entrenamiento"; summary_card = shareable card without exercises. */
  kind: 'detail' | 'summary_card' | 'other';
  has_header: boolean;
  header: ExtractedHeader | null;
  exercises: ExtractedExercise[];
}

const nullable = (type: 'string' | 'number' | 'integer') => ({ anyOf: [{ type }, { type: 'null' }] });

/** JSON schema sent as `output_config.format` (structured outputs). */
export const EXTRACTED_PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'has_header', 'header', 'exercises'],
  properties: {
    kind: { type: 'string', enum: ['detail', 'summary_card', 'other'] },
    has_header: { type: 'boolean' },
    header: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'name', 'duration_min', 'volume_kg', 'sets_total'],
          properties: {
            date: nullable('string'),
            name: nullable('string'),
            duration_min: nullable('number'),
            volume_kg: nullable('number'),
            sets_total: nullable('integer'),
          },
        },
        { type: 'null' },
      ],
    },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'sets', 'cut_at_top', 'cut_at_bottom'],
        properties: {
          name: { type: 'string' },
          cut_at_top: { type: 'boolean' },
          cut_at_bottom: { type: 'boolean' },
          sets: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['index', 'weight_kg', 'reps'],
              properties: {
                index: { type: 'integer' },
                weight_kg: { type: 'number' },
                reps: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export class ExtractionError extends Error {}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => (v === null || v === undefined ? null : isNum(v) ? v : NaN);

/** Validates and normalises an extracted page; throws ExtractionError when the shape is wrong. */
export function validateExtractedPage(raw: unknown): ExtractedPage {
  const fail = (msg: string): never => {
    throw new ExtractionError(`Respuesta no válida: ${msg}`);
  };
  if (typeof raw !== 'object' || raw === null) fail('no es un objeto');
  const p = raw as Record<string, unknown>;
  const kind = p.kind;
  if (kind !== 'detail' && kind !== 'summary_card' && kind !== 'other') fail('kind');
  if (!Array.isArray(p.exercises)) fail('exercises');

  let header: ExtractedHeader | null = null;
  if (p.header !== null && p.header !== undefined) {
    if (typeof p.header !== 'object') fail('header');
    const h = p.header as Record<string, unknown>;
    const date = typeof h.date === 'string' ? normalizeDate(h.date) : null;
    header = {
      date,
      name: typeof h.name === 'string' && h.name.trim() ? h.name.trim() : null,
      duration_min: optNum(h.duration_min),
      volume_kg: optNum(h.volume_kg),
      sets_total: optNum(h.sets_total),
    };
    if ([header.duration_min, header.volume_kg, header.sets_total].some((v) => Number.isNaN(v))) fail('números de cabecera');
  }

  const exercises: ExtractedExercise[] = (p.exercises as unknown[]).map((e, i) => {
    if (typeof e !== 'object' || e === null) fail(`ejercicio ${i}`);
    const x = e as Record<string, unknown>;
    if (typeof x.name !== 'string' || !x.name.trim()) fail(`nombre del ejercicio ${i}`);
    if (!Array.isArray(x.sets)) fail(`series del ejercicio ${i}`);
    const sets = (x.sets as unknown[]).map((s, j) => {
      const y = s as Record<string, unknown>;
      if (!isNum(y?.index) || !isNum(y?.weight_kg) || !isNum(y?.reps)) fail(`serie ${j} del ejercicio ${i}`);
      if ((y.weight_kg as number) < 0 || (y.reps as number) < 0) fail(`valores negativos en el ejercicio ${i}`);
      return { index: y.index as number, weight_kg: y.weight_kg as number, reps: y.reps as number };
    });
    return { name: (x.name as string).trim(), sets, cut_at_top: x.cut_at_top === true, cut_at_bottom: x.cut_at_bottom === true };
  });

  const hasHeader = Boolean(header && header.date && header.name);
  return { kind: kind as ExtractedPage['kind'], has_header: hasHeader, header: hasHeader ? header : null, exercises };
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** "2026-09-08" or "8 de septiembre, 2026" → "2026-09-08"; anything else → null. */
export function normalizeDate(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\s+de\s+([a-záéíóú]+),?\s+(?:de\s+)?(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS[m[2]!];
    if (month) return `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return null;
}
