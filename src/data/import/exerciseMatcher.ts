// Maps names read from screenshots to the exercise library (spec 7.2: approximate match;
// the first time the user confirms and the name is saved as an alias).

import { normalizeName } from './sessionGrouper';

export interface MatchableExercise {
  id: string;
  name: string;
  aliases: string[];
}

export interface ExerciseMatch {
  exerciseId?: string;
  /** 1 = exact name/alias (no confirmation needed); lower = suggestion to confirm. */
  score: number;
  exact: boolean;
}

const STOP = new Set(['de', 'del', 'al', 'con', 'la', 'el', 'en', 'y', 'a']);

function tokens(s: string): Set<string> {
  return new Set(
    normalizeName(s)
      .replace(/[^a-z0-9° ]/g, ' ')
      .split(' ')
      .filter((t) => t && !STOP.has(t)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function matchExercise(name: string, library: ReadonlyArray<MatchableExercise>, minScore = 0.45): ExerciseMatch {
  const n = normalizeName(name);
  for (const ex of library) {
    if (normalizeName(ex.name) === n || ex.aliases.some((a) => normalizeName(a) === n)) {
      return { exerciseId: ex.id, score: 1, exact: true };
    }
  }
  const t = tokens(name);
  let best: ExerciseMatch = { score: 0, exact: false };
  for (const ex of library) {
    const score = Math.max(similarity(t, tokens(ex.name)), ...ex.aliases.map((a) => similarity(t, tokens(a))));
    if (score > best.score) best = { exerciseId: ex.id, score, exact: false };
  }
  return best.score >= minScore ? best : { score: best.score, exact: false };
}
