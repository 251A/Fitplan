// Date helpers that work on "YYYY-MM-DD" keys in a given IANA time zone.
// Domain code never relies on the machine's local time zone, so tests are deterministic.

export type DateKey = string; // "2026-10-08"

export const DEFAULT_TIME_ZONE = 'Europe/Madrid';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Calendar date of an instant in the given time zone. */
export function dateKey(ms: number, timeZone: string = DEFAULT_TIME_ZONE): DateKey {
  return formatter(timeZone).format(new Date(ms));
}

/** Adds whole days to a date key (pure calendar arithmetic, DST-safe). */
export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d + days);
  return new Date(t).toISOString().slice(0, 10);
}

/** Inclusive list of date keys from `from` to `to`. */
export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function formatDuration(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
