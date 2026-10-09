import { describe, expect, it } from 'vitest';
import library from '../../resources/exerciseLibrary.json';
import type { Exercise, GymSession } from '../db/models';
import { matchExercise } from './exerciseMatcher';
import { ExtractionError, normalizeDate, validateExtractedPage, type ExtractedPage } from './extraction';
import {
  buildDrafts,
  draftToSession,
  isReady,
  learnedAliases,
  reviewQuestions,
  type ReviewContext,
} from './importValidator';
import { attachOrphan, groupPages } from './sessionGrouper';
import pagesFixture from './__fixtures__/symmetry-pages.json';

const pages = (pagesFixture as unknown[]).map(validateExtractedPage);
const exercises = library.exercises as Exercise[];
const byId = new Map(exercises.map((e) => [e.id, e]));

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  exercises: byId,
  loadModeAnswers: new Map(),
  lastWeight: () => undefined,
  ...over,
});

describe('validateExtractedPage', () => {
  it('rejects malformed model output', () => {
    expect(() => validateExtractedPage({ kind: 'detail', exercises: [{ name: 'X', sets: [{ index: 1, weight_kg: 'a', reps: 1 }] }] })).toThrow(
      ExtractionError,
    );
    expect(() => validateExtractedPage({ kind: 'weird', exercises: [] })).toThrow(ExtractionError);
  });

  it('treats a header without date or name as no header', () => {
    const p = validateExtractedPage({ kind: 'detail', has_header: true, header: { date: null, name: 'X', duration_min: null, volume_kg: null, sets_total: null }, exercises: [] });
    expect(p.has_header).toBe(false);
  });

  it('parses Spanish dates', () => {
    expect(normalizeDate('8 de septiembre, 2026')).toBe('2026-09-08');
    expect(normalizeDate('2026-10-07')).toBe('2026-10-07');
    expect(normalizeDate('ayer')).toBeNull();
  });
});

describe('groupPages', () => {
  const result = groupPages(pages);

  it('groups by header, attaches headerless pages and ignores share cards with detail', () => {
    expect(result.orphans).toEqual([]);
    expect(result.sessions.map((s) => `${s.date} ${s.name}`)).toEqual([
      '2026-09-08 Tracción A',
      '2026-09-09 Pierna',
      '2026-09-12 Tracción B', // share card only → summary session
    ]);
    expect(result.sessions[2]!.summaryOnly).toBe(true);
  });

  it('merges cut blocks and drops overlapping sets', () => {
    const traccion = result.sessions[0]!;
    expect(traccion.pages).toEqual([0, 1, 3]); // out-of-order page 3 still joins by header
    const [jalon, curl] = traccion.exercises;
    expect(jalon!.sets.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(curl!.sets.map((s) => `${s.weight_kg}x${s.reps}`)).toEqual(['24x9', '24x8']);
  });

  it('cross-checks sets and volume against the header', () => {
    expect(result.sessions[0]!.issues).toEqual([]);
    expect(result.sessions[1]!.issues).toEqual([expect.stringContaining('volumen 2800 kg, leído 1400 kg')]);
  });

  it('reports a headerless first page as orphan and lets the user attach it', () => {
    const shuffled: ExtractedPage[] = [pages[1]!, pages[0]!];
    const r = groupPages(shuffled);
    expect(r.orphans).toEqual([0]);
    expect(r.sessions[0]!.exercises[0]!.sets).toHaveLength(2);
    attachOrphan(r, shuffled, 0, r.sessions[0]!.key);
    expect(r.orphans).toEqual([]);
    expect(r.sessions[0]!.exercises[0]!.sets).toHaveLength(3);
  });
});

describe('exercise matching', () => {
  it('matches Symmetry names exactly through aliases', () => {
    const m = matchExercise('Jalón Al Pecho Agarre Neutro Abierto (Máquina)', exercises);
    expect(m).toMatchObject({ exerciseId: 'lat-pulldown-neutral-wide', exact: true });
  });

  it('suggests the closest exercise for a new wording', () => {
    const m = matchExercise('Jalón pecho agarre prono maquina', exercises);
    expect(m.exerciseId).toBe('lat-pulldown-pronated');
    expect(m.exact).toBe(false);
  });

  it('returns no match for unrelated names', () => {
    expect(matchExercise('Dominadas lastradas', exercises).exerciseId).toBeUndefined();
  });
});

describe('review drafts', () => {
  const grouped = groupPages(pages).sessions;

  it('flags a suspicious jump and resolves it as "the pair" (24 kg → 12 kg per dumbbell)', () => {
    const [d] = buildDrafts(grouped, exercises, []);
    const c = ctx({ lastWeight: (id) => (id === 'incline-curl-db' ? 12 : undefined) });
    const qs = reviewQuestions(d!, c);
    expect(qs).toEqual([expect.objectContaining({ kind: 'jump', exerciseIndex: 1 })]);
    expect(isReady(d!, c)).toBe(false);

    d!.exercises[1]!.loggedAsPair = true;
    expect(reviewQuestions(d!, c)).toEqual([]);
    const saved = draftToSession(d!, c, 0);
    expect(saved.sets.filter((s) => s.exerciseId === 'incline-curl-db').map((s) => s.weightKg)).toEqual([12, 12]);
  });

  it('marks 0 kg sets as not done and keeps header mismatches for review', () => {
    const d = buildDrafts(grouped, exercises, [])[1]!;
    const saved = draftToSession(d, ctx(), 0);
    expect(saved.sets.map((s) => s.skipped)).toEqual([false, true]);
    expect(saved.needsReview).toBe(true);
  });

  it('asks dumbbell-or-pair for "por confirmar" exercises', () => {
    const d = buildDrafts(grouped, exercises, [])[0]!;
    d.exercises[1]!.exerciseId = 'concentration-curl-reverse';
    const qs = reviewQuestions(d, ctx());
    expect(qs.map((q) => q.kind)).toContain('loadMode');
    expect(reviewQuestions(d, ctx({ loadModeAnswers: new Map([['concentration-curl-reverse', 'perDumbbell']]) })).map((q) => q.kind)).not.toContain(
      'loadMode',
    );
  });

  it('detects already imported sessions and does not include them by default', () => {
    const existing = [{ id: 'seed-1', date: '2026-09-08', templateName: 'tracción a' } as GymSession];
    const d = buildDrafts(grouped, exercises, existing)[0]!;
    expect(d.duplicateOf).toBe('seed-1');
    expect(d.include).toBe(false);
    expect(isReady(d, ctx())).toBe(true);
    expect(draftToSession({ ...d, include: true }, ctx(), 0).id).toBe('seed-1'); // replaces, never duplicates
  });

  it('learns confirmed names as aliases', () => {
    const d = buildDrafts(grouped, exercises, [])[0]!;
    d.exercises[0]!.rawName = 'Jalón neutro abierto';
    d.exercises[0]!.confirmed = true;
    expect(learnedAliases(d, ctx()).get('lat-pulldown-neutral-wide')).toEqual(['Jalón neutro abierto']);
  });
});
