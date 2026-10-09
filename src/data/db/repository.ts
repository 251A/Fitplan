import { DEFAULT_TIME_ZONE, type DateKey } from '../../domain/dates';
import { buildDailyHealth, type DailyHealth } from '../../domain/health/dailyMetrics';
import { DEFAULT_RECOVERY_CONFIG, type RecoveryConfig } from '../../domain/recovery/recoveryConfig';
import library from '../../resources/exerciseLibrary.json';
import type { ParsedHealthPayload } from '../health/payload';
import { Database, DB_VERSION, STORES, type StoreName } from './db';
import type {
  Exercise,
  GymSession,
  HealthWorkout,
  SeedBestSet,
  SyncInfo,
  UserProfile,
} from './models';

const KV = {
  profile: 'profile',
  seedVersion: 'seedVersion',
  lastSync: 'lastSync',
  recoveryConfig: 'recoveryConfig',
} as const;

export const DEFAULT_PROFILE: UserProfile = {
  heightCm: 0,
  startWeightKg: 0,
  startWeightDate: '',
  hrMaxObserved: 0,
  stepGoal: 10000,
  gymBaseDays: 5,
  threeDayTemplate: 'upperLowerFull',
};

/** Loads the public exercise library (no personal data) and a blank profile. */
export async function seedIfEmpty(db: Database): Promise<boolean> {
  if ((await db.getKV<number>(KV.seedVersion)) !== undefined) return false;
  await db.putMany(STORES.exercises, library.exercises as Exercise[]);
  if (!(await getProfile(db))) await db.setKV(KV.profile, DEFAULT_PROFILE);
  await db.setKV(KV.seedVersion, library.version);
  return true;
}

/** Personal starting data (profile, best sets, past sessions) kept out of the public repo. */
export interface PersonalSeed {
  app: 'fitplan-personal-seed';
  version: number;
  profile: UserProfile;
  bestSets: Array<Omit<SeedBestSet, 'id'>>;
  sessions: Array<{
    date: DateKey | null;
    templateName: string;
    note?: string;
    sets?: Array<{ exerciseId: string; weightKg: number; reps: number }>;
  }>;
}

export async function importPersonalSeed(db: Database, json: string): Promise<{ sessions: number }> {
  let seed: PersonalSeed;
  try {
    seed = JSON.parse(json.replace(/^﻿/, '')) as PersonalSeed;
  } catch {
    throw new Error('El archivo no es JSON válido.');
  }
  if (seed?.app !== 'fitplan-personal-seed') {
    throw new Error('El archivo no son datos iniciales de FitPlan (seed-personal.json).');
  }
  const sessions: GymSession[] = seed.sessions.map((s, i) => ({
    id: `seed-${s.date ?? 'undated'}-${i}`,
    date: s.date,
    templateName: s.templateName,
    source: 'seed',
    note: s.note,
    sets: (s.sets ?? []).map((set, order) => ({ ...set, order, skipped: set.weightKg === 0 })),
    summaryOnly: !s.sets,
  }));
  const bestSets: SeedBestSet[] = seed.bestSets.map((b, i) => ({ ...b, id: `seed-best-${i}` }));

  // Re-importing replaces previous seed rows instead of duplicating them (stale ids are deleted).
  const newIds = new Set(bestSets.map((b) => b.id));
  const stale = (await db.getAll<SeedBestSet>(STORES.seedBestSets)).filter((b) => !newIds.has(b.id));

  await db.writeSynced([
    ...stale.map((b) => ({ store: 'seedBestSets' as const, key: b.id, value: null })),
    ...bestSets.map((b) => ({ store: 'seedBestSets' as const, key: b.id, value: b })),
    ...sessions.map((s) => ({ store: 'gymSessions' as const, key: s.id, value: s })),
    { store: 'kv', key: KV.profile, value: { ...DEFAULT_PROFILE, ...seed.profile } },
  ]);
  return { sessions: sessions.length };
}

/**
 * Merges a Health payload into the stored days. Newer values win field by field, so a
 * partial sync (e.g. only today's steps) never erases older data.
 */
export async function importHealth(
  db: Database,
  parsed: ParsedHealthPayload,
  timeZone: string = DEFAULT_TIME_ZONE,
  nowMs: number = Date.now(),
): Promise<SyncInfo> {
  const incoming = buildDailyHealth(parsed, timeZone);
  const merged: DailyHealth[] = [];
  for (const day of incoming) {
    const existing = await db.get<DailyHealth>(STORES.dailyHealth, day.date);
    const defined = Object.fromEntries(Object.entries(day).filter(([, v]) => v !== undefined));
    merged.push({ ...existing, ...defined, date: day.date });
  }
  await db.putMany(STORES.dailyHealth, merged);

  const existingIds = new Set((await db.getAll<HealthWorkout>(STORES.healthWorkouts)).map((w) => w.id));
  const workouts: HealthWorkout[] = parsed.workouts.map((w) => ({
    ...w,
    id: `${w.startMs}-${w.source ?? 'Salud'}`,
  }));
  await db.putMany(STORES.healthWorkouts, workouts);

  const info: SyncInfo = {
    lastSyncMs: nowMs,
    generatedAtMs: parsed.generatedAtMs,
    daysUpdated: merged.length,
    workoutsAdded: workouts.filter((w) => !existingIds.has(w.id)).length,
    warnings: parsed.warnings,
  };
  await db.setKV(KV.lastSync, info);
  return info;
}

export const getProfile = (db: Database) => db.getKV<UserProfile>(KV.profile);
export const saveProfile = (db: Database, p: UserProfile) =>
  db.writeSynced([{ store: 'kv', key: KV.profile, value: p }]);

export async function getRecoveryConfig(db: Database): Promise<RecoveryConfig> {
  // Merge with defaults so thresholds added in later versions get a value.
  return { ...DEFAULT_RECOVERY_CONFIG, ...(await db.getKV<Partial<RecoveryConfig>>(KV.recoveryConfig)) };
}
export const saveRecoveryConfig = (db: Database, c: RecoveryConfig | null) =>
  db.writeSynced([{ store: 'kv', key: KV.recoveryConfig, value: c }]);
export const getLastSync = (db: Database) => db.getKV<SyncInfo>(KV.lastSync);

export async function getDailyHealth(db: Database): Promise<DailyHealth[]> {
  const days = await db.getAll<DailyHealth>(STORES.dailyHealth);
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getWorkouts(db: Database): Promise<HealthWorkout[]> {
  const ws = await db.getAll<HealthWorkout>(STORES.healthWorkouts);
  return ws.sort((a, b) => a.startMs - b.startMs);
}

// ---- Backup ---------------------------------------------------------------

export interface Backup {
  app: 'fitplan';
  schemaVersion: number;
  exportedAt: string;
  data: Record<StoreName, unknown[]>;
}

export async function exportBackup(db: Database, now: Date = new Date()): Promise<Backup> {
  return { app: 'fitplan', schemaVersion: DB_VERSION, exportedAt: now.toISOString(), data: await db.exportAll() };
}

export async function restoreBackup(db: Database, json: string): Promise<void> {
  let backup: Backup;
  try {
    backup = JSON.parse(json) as Backup;
  } catch {
    throw new Error('El archivo no es una copia de seguridad válida.');
  }
  if (backup?.app !== 'fitplan' || typeof backup.data !== 'object') {
    throw new Error('El archivo no es una copia de seguridad de FitPlan.');
  }
  if (backup.schemaVersion > DB_VERSION) {
    throw new Error('La copia es de una versión más nueva de la app. Actualiza la app primero.');
  }
  await db.replaceAll(backup.data);
}
