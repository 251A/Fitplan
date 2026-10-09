// Turns per-screenshot extractions into sessions (spec 7.1 step 3). Real problems handled:
// - one session spans 2–3 screenshots and some have no header → attach to the previous page's session
// - screenshots overlap when scrolling → drop duplicated blocks, merge sets by index
// - a block cut at the bottom continues at the top of the next screenshot → merge
// - screenshots are not chronological → group by header (date + name), not by position
// - a headerless page with no previous session → ask the user (orphan)
// - cross-check sets and volume against the header → "revisar"

import type { ExtractedExercise, ExtractedPage, ExtractedSet } from './extraction';

export interface GroupedExercise {
  name: string;
  sets: ExtractedSet[];
  cutAtBottom: boolean;
}

export interface GroupedSession {
  key: string;
  date: string;
  name: string;
  durationMin?: number;
  header: { volumeKg?: number; setsTotal?: number };
  exercises: GroupedExercise[];
  pages: number[];
  /** Only a share card was found: no exercises. */
  summaryOnly: boolean;
  issues: string[];
}

export interface GroupingResult {
  sessions: GroupedSession[];
  /** Indexes of headerless pages that could not be attached to a session. */
  orphans: number[];
}

export const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const sameSets = (a: ExtractedSet[], b: ExtractedSet[]) =>
  a.length === b.length && a.every((s, i) => s.index === b[i]!.index && s.weight_kg === b[i]!.weight_kg && s.reps === b[i]!.reps);

function mergeSets(into: ExtractedSet[], from: ExtractedSet[]): ExtractedSet[] {
  const byIndex = new Map(into.map((s) => [s.index, s]));
  for (const s of from) if (!byIndex.has(s.index)) byIndex.set(s.index, s);
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

function addBlock(session: GroupedSession, block: ExtractedExercise): void {
  const name = normalizeName(block.name);
  const last = session.exercises[session.exercises.length - 1];

  // Continuation of a block cut between two screenshots.
  if (last && normalizeName(last.name) === name && (last.cutAtBottom || block.cut_at_top)) {
    last.sets = mergeSets(last.sets, block.sets);
    last.cutAtBottom = block.cut_at_bottom;
    return;
  }
  // Overlap: the same block (or a part of it) appears again on the next screenshot.
  const existing = session.exercises.find((e) => normalizeName(e.name) === name);
  if (existing) {
    const isRepeat =
      sameSets(existing.sets, block.sets) ||
      block.sets.every((s) => existing.sets.some((x) => x.index === s.index && x.weight_kg === s.weight_kg && x.reps === s.reps));
    if (isRepeat) return;
    if (block.cut_at_top) {
      existing.sets = mergeSets(existing.sets, block.sets);
      return;
    }
  }
  session.exercises.push({ name: block.name, sets: [...block.sets], cutAtBottom: block.cut_at_bottom });
}

/** Rounded comparison with a small tolerance (screens show 1 decimal). */
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);

export function groupPages(pages: ReadonlyArray<ExtractedPage>): GroupingResult {
  const sessions = new Map<string, GroupedSession>();
  const orphans: number[] = [];
  const summaryCards: Array<{ page: ExtractedPage; index: number }> = [];
  let current: GroupedSession | undefined;

  pages.forEach((page, index) => {
    if (page.kind === 'other') {
      current = undefined;
      return;
    }
    if (page.kind === 'summary_card') {
      summaryCards.push({ page, index });
      return;
    }
    const h = page.header;
    if (page.has_header && h?.date && h.name) {
      const key = `${h.date}|${normalizeName(h.name)}`;
      let s = sessions.get(key);
      if (!s) {
        s = {
          key,
          date: h.date,
          name: h.name,
          header: {},
          exercises: [],
          pages: [],
          summaryOnly: false,
          issues: [],
        };
        sessions.set(key, s);
      }
      s.durationMin ??= h.duration_min ?? undefined;
      s.header.volumeKg ??= h.volume_kg ?? undefined;
      s.header.setsTotal ??= h.sets_total ?? undefined;
      current = s;
    }
    if (!current) {
      orphans.push(index);
      return;
    }
    current.pages.push(index);
    for (const block of page.exercises) addBlock(current, block);
  });

  // Share cards are ignored when the detail exists; otherwise they give a summary-only session.
  for (const { page, index } of summaryCards) {
    const h = page.header;
    if (!h?.date || !h.name) continue;
    const key = `${h.date}|${normalizeName(h.name)}`;
    if (sessions.has(key)) continue;
    sessions.set(key, {
      key,
      date: h.date,
      name: h.name,
      durationMin: h.duration_min ?? undefined,
      header: { volumeKg: h.volume_kg ?? undefined, setsTotal: h.sets_total ?? undefined },
      exercises: [],
      pages: [index],
      summaryOnly: true,
      issues: [],
    });
  }

  for (const s of sessions.values()) crossCheck(s);
  return { sessions: [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date)), orphans };
}

/** Sets and volume (kg × reps) must match the header; otherwise mark the session for review. */
export function crossCheck(s: GroupedSession): void {
  s.issues = s.issues.filter((i) => !i.startsWith('Cabecera:'));
  if (s.summaryOnly) return;
  const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = s.exercises.reduce((v, e) => v + e.sets.reduce((x, set) => x + set.weight_kg * set.reps, 0), 0);
  if (s.header.setsTotal !== undefined && sets !== s.header.setsTotal) {
    s.issues.push(`Cabecera: ${s.header.setsTotal} series, leídas ${sets}. ¿Falta alguna captura?`);
  }
  if (s.header.volumeKg !== undefined && !close(volume, s.header.volumeKg)) {
    s.issues.push(`Cabecera: volumen ${s.header.volumeKg} kg, leído ${Math.round(volume * 10) / 10} kg.`);
  }
}

/** Attaches an orphan page to a session chosen by the user, then re-checks it. */
export function attachOrphan(result: GroupingResult, pages: ReadonlyArray<ExtractedPage>, pageIndex: number, sessionKey: string): void {
  const s = result.sessions.find((x) => x.key === sessionKey);
  const page = pages[pageIndex];
  if (!s || !page) return;
  s.pages.push(pageIndex);
  for (const block of page.exercises) addBlock(s, block);
  result.orphans = result.orphans.filter((i) => i !== pageIndex);
  crossCheck(s);
}
