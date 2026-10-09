// Review drafts and validation rules (spec 7.2): 0 kg = not done, >40 % jumps, dumbbell vs pair,
// approximate name matches to confirm, duplicates, header cross-check. Questions are derived from
// the draft's current state, so they disappear as the user answers them on the review screen.

import { isSuspiciousJump, normalizeWeight, type LoadMode } from '../../domain/strength/strength';
import type { Exercise, GymSession } from '../db/models';
import { matchExercise } from './exerciseMatcher';
import { normalizeName, type GroupedSession } from './sessionGrouper';

export interface DraftSet {
  /** As shown on the screenshot. */
  weightKg: number;
  reps: number;
}

export interface DraftExercise {
  rawName: string;
  exerciseId?: string;
  /** Exact name/alias match, or the user confirmed the choice. */
  confirmed: boolean;
  /** The logged weight was the pair of dumbbells (halved on save). */
  loggedAsPair: boolean;
  /** User confirmed a big jump is right. */
  jumpAcknowledged: boolean;
  sets: DraftSet[];
}

export interface DraftSession {
  key: string;
  date: string;
  name: string;
  durationMin?: number;
  header: GroupedSession['header'];
  summaryOnly: boolean;
  exercises: DraftExercise[];
  /** Indexes of the source screenshots (for thumbnails on the review screen). */
  pages: number[];
  issues: string[];
  /** Id of an already saved session with the same date and name. */
  duplicateOf?: string;
  include: boolean;
}

export type QuestionKind = 'unknownExercise' | 'confirmMatch' | 'loadMode' | 'jump';

export interface ReviewQuestion {
  kind: QuestionKind;
  exerciseIndex: number;
  text: string;
}

export interface ReviewContext {
  exercises: ReadonlyMap<string, Exercise>;
  /** Load modes answered during this review (exerciseId → mode), applied on save. */
  loadModeAnswers: ReadonlyMap<string, LoadMode>;
  /** Last top weight (normalised) per exercise before a date. */
  lastWeight: (exerciseId: string, beforeDate: string) => number | undefined;
}

export function buildDrafts(
  grouped: ReadonlyArray<GroupedSession>,
  library: ReadonlyArray<Exercise>,
  existing: ReadonlyArray<GymSession>,
): DraftSession[] {
  return grouped.map((g) => {
    const dup = existing.find((s) => s.date === g.date && normalizeName(s.templateName) === normalizeName(g.name));
    return {
      key: g.key,
      date: g.date,
      name: g.name,
      durationMin: g.durationMin,
      header: g.header,
      summaryOnly: g.summaryOnly,
      pages: [...g.pages],
      issues: [...g.issues],
      duplicateOf: dup?.id,
      include: !dup,
      exercises: g.exercises.map((e) => {
        const m = matchExercise(e.name, library);
        const ex = library.find((x) => x.id === m.exerciseId);
        return {
          rawName: e.name,
          exerciseId: m.exerciseId,
          confirmed: m.exact,
          loggedAsPair: ex?.symmetryLogsPair ?? false,
          jumpAcknowledged: false,
          sets: e.sets.map((s) => ({ weightKg: s.weight_kg, reps: s.reps })),
        };
      }),
    };
  });
}

const effectiveMode = (ex: Exercise, ctx: ReviewContext): LoadMode => ctx.loadModeAnswers.get(ex.id) ?? ex.loadMode;

const fmt = (kg: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(kg);

export function topWeight(e: DraftExercise, mode: LoadMode): number {
  const w = Math.max(0, ...e.sets.map((s) => s.weightKg));
  return normalizeWeight(w, mode, e.loggedAsPair);
}

export function reviewQuestions(d: DraftSession, ctx: ReviewContext): ReviewQuestion[] {
  const out: ReviewQuestion[] = [];
  d.exercises.forEach((e, i) => {
    const ex = e.exerciseId ? ctx.exercises.get(e.exerciseId) : undefined;
    if (!ex) {
      out.push({ kind: 'unknownExercise', exerciseIndex: i, text: `"${e.rawName}" no está en tu biblioteca. Elige a qué ejercicio corresponde.` });
      return;
    }
    if (!e.confirmed) {
      out.push({ kind: 'confirmMatch', exerciseIndex: i, text: `¿"${e.rawName}" es "${ex.name}"?` });
    }
    const mode = effectiveMode(ex, ctx);
    if (mode === 'unconfirmed') {
      out.push({ kind: 'loadMode', exerciseIndex: i, text: `${ex.name}: ¿el peso que apuntas es de una mancuerna o del par?` });
      return;
    }
    if (!e.jumpAcknowledged) {
      const prev = ctx.lastWeight(ex.id, d.date);
      const now = topWeight(e, mode);
      if (isSuspiciousJump(prev, now)) {
        out.push({
          kind: 'jump',
          exerciseIndex: i,
          text: `${ex.name}: ${fmt(now)} kg frente a ${fmt(prev!)} kg la última vez. ¿Es por mancuerna, el par, o era en máquina?`,
        });
      }
    }
  });
  return out;
}

/** True when the draft can be saved without unanswered questions. */
export function isReady(d: DraftSession, ctx: ReviewContext): boolean {
  return !d.include || reviewQuestions(d, ctx).length === 0;
}

/** Builds the session to store: weights normalised, 0 kg sets marked as not done. */
export function draftToSession(d: DraftSession, ctx: ReviewContext, now = Date.now()): GymSession {
  const sets = d.exercises.flatMap((e) => {
    const ex = e.exerciseId ? ctx.exercises.get(e.exerciseId) : undefined;
    if (!ex) return [];
    const mode = effectiveMode(ex, ctx);
    return e.sets.map((s) => ({ exerciseId: ex.id, weightKg: normalizeWeight(s.weightKg, mode, e.loggedAsPair), reps: s.reps }));
  });
  return {
    id: d.duplicateOf ?? `symmetry-${d.date}-${normalizeName(d.name).replace(/[^a-z0-9]+/g, '-')}`,
    date: d.date,
    templateName: d.name,
    source: 'symmetry',
    durationMin: d.durationMin,
    sets: sets.map((s, order) => ({ ...s, order, skipped: s.weightKg === 0 })),
    summaryOnly: d.summaryOnly,
    header: d.header,
    needsReview: d.issues.length > 0,
    createdAt: now,
  };
}

/** Names confirmed by the user become aliases, so the next import matches exactly. */
export function learnedAliases(d: DraftSession, ctx: ReviewContext): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of d.exercises) {
    const ex = e.exerciseId ? ctx.exercises.get(e.exerciseId) : undefined;
    if (!ex) continue;
    const n = normalizeName(e.rawName);
    const known = [ex.name, ...ex.aliases].some((a) => normalizeName(a) === n);
    if (!known) out.set(ex.id, [...(out.get(ex.id) ?? []), e.rawName]);
  }
  return out;
}
