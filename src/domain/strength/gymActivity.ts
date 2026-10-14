// Gym activity summaries for the profile/streak screens. Pure functions over plain data.

import { addDays, type DateKey } from '../dates';
import { epley, weekStart, type SessionLike } from './strength';

/** Total volume (kg × reps) of the effective sets of one session. */
export function sessionVolumeKg(session: SessionLike): number {
  let total = 0;
  for (const s of session.sets) {
    if (s.skipped || s.weightKg <= 0 || s.reps <= 0) continue;
    total += s.weightKg * s.reps;
  }
  return total;
}

/**
 * Consecutive ISO weeks with at least `minPerWeek` sessions, counted back from the current week.
 * The current week only adds to the streak once it reaches the minimum; until then it does not
 * break it either (the week is still in progress).
 */
export function weeklyStreak(sessions: ReadonlyArray<SessionLike>, today: DateKey, minPerWeek = 1): number {
  const perWeek = new Map<DateKey, number>();
  for (const s of sessions) {
    if (!s.date || s.date > today) continue;
    const w = weekStart(s.date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  let week = weekStart(today);
  let streak = 0;
  if ((perWeek.get(week) ?? 0) >= minPerWeek) streak++;
  week = addDays(week, -7);
  while ((perWeek.get(week) ?? 0) >= minPerWeek) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

export interface WeekVolume {
  week: DateKey;
  volumeKg: number;
  sessions: number;
}

/** Volume and session count for the last `weeks` ISO weeks (oldest first, current week last). */
export function weeklyVolumeSeries(sessions: ReadonlyArray<SessionLike>, today: DateKey, weeks = 8): WeekVolume[] {
  const current = weekStart(today);
  const out: WeekVolume[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ week: addDays(current, -7 * i), volumeKg: 0, sessions: 0 });
  const index = new Map(out.map((w, i) => [w.week, i]));
  for (const s of sessions) {
    if (!s.date || s.date > today) continue;
    const i = index.get(weekStart(s.date));
    if (i === undefined) continue;
    out[i]!.volumeKg += sessionVolumeKg(s);
    out[i]!.sessions++;
  }
  return out;
}

export interface PersonalRecord {
  exerciseId: string;
  date: DateKey;
  weightKg: number;
  reps: number;
  e1rm: number;
  previousE1rm: number;
}

/**
 * Sessions where an exercise beat its previous best estimated 1RM (Epley, 1–12 reps).
 * The first appearance of an exercise sets the baseline and is not a record. Newest first.
 */
export function personalRecords(sessions: ReadonlyArray<SessionLike>): PersonalRecord[] {
  const dated = sessions.filter((s) => s.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const best = new Map<string, number>();
  const out: PersonalRecord[] = [];
  for (const s of dated) {
    const top = new Map<string, { e1rm: number; weightKg: number; reps: number }>();
    for (const set of s.sets) {
      if (set.skipped) continue;
      const e = epley(set.weightKg, set.reps);
      if (e === undefined) continue;
      const cur = top.get(set.exerciseId);
      if (!cur || e > cur.e1rm) top.set(set.exerciseId, { e1rm: e, weightKg: set.weightKg, reps: set.reps });
    }
    for (const [exerciseId, t] of top) {
      const prev = best.get(exerciseId);
      if (prev !== undefined && t.e1rm > prev + 1e-9) {
        out.push({ exerciseId, date: s.date!, weightKg: t.weightKg, reps: t.reps, e1rm: t.e1rm, previousE1rm: prev });
      }
      if (prev === undefined || t.e1rm > prev) best.set(exerciseId, t.e1rm);
    }
  }
  return out.reverse();
}

/** Dates with at least one session in the `days` days ending today. */
export function trainedDays(sessions: ReadonlyArray<SessionLike>, today: DateKey, days = 90): Set<DateKey> {
  const from = addDays(today, -(days - 1));
  const out = new Set<DateKey>();
  for (const s of sessions) {
    if (s.date && s.date >= from && s.date <= today) out.add(s.date);
  }
  return out;
}
