import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseHealthPayload } from '../health/payload';
import { Database, STORES } from './db';
import type { GymSession } from './models';
import {
  DEFAULT_PROFILE,
  exportBackup,
  getDailyHealth,
  getProfile,
  getWorkouts,
  importHealth,
  importPersonalSeed,
  restoreBackup,
  seedIfEmpty,
} from './repository';
import fixture from '../health/__fixtures__/payload-es.json';
import personalSeed from './__fixtures__/personal-seed-sample.json';

let db: Database;

beforeEach(async () => {
  db = await Database.open(new IDBFactory(), 'test');
});

describe('seedIfEmpty', () => {
  it('loads only the public library and a blank profile, once', async () => {
    expect(await seedIfEmpty(db)).toBe(true);
    expect(await seedIfEmpty(db)).toBe(false);
    expect((await db.getAll(STORES.exercises)).length).toBe(23);
    expect((await db.getAll(STORES.gymSessions)).length).toBe(0);
    expect(await getProfile(db)).toEqual(DEFAULT_PROFILE);
  });
});

describe('importPersonalSeed', () => {
  it('loads profile, best sets and sessions; re-import does not duplicate', async () => {
    await seedIfEmpty(db);
    const json = JSON.stringify(personalSeed);
    expect(await importPersonalSeed(db, json)).toEqual({ sessions: 3 });
    await importPersonalSeed(db, '﻿' + json); // BOM from Windows editors is tolerated
    const sessions = await db.getAll<GymSession>(STORES.gymSessions);
    expect(sessions.length).toBe(3);
    expect(sessions.find((s) => s.date === null)?.sets.map((s) => s.skipped)).toEqual([false, true]);
    expect((await db.getAll(STORES.seedBestSets)).length).toBe(2);
    expect((await getProfile(db))?.hrMaxObserved).toBe(185);
  });

  it('rejects other files', async () => {
    await expect(importPersonalSeed(db, '{"app":"x"}')).rejects.toThrow(/seed-personal/);
  });
});

describe('importHealth', () => {
  it('is idempotent and merges partial syncs field by field', async () => {
    const parsed = parseHealthPayload(fixture);
    const first = await importHealth(db, parsed, 'Europe/Madrid', 1000);
    expect(first.workoutsAdded).toBe(2);
    const second = await importHealth(db, parsed, 'Europe/Madrid', 2000);
    expect(second.workoutsAdded).toBe(0);
    expect((await getWorkouts(db)).length).toBe(2);

    // A later sync with only steps must not erase sleep or HRV.
    await importHealth(db, parseHealthPayload({ version: 1, steps: [{ date: '2026-10-08', value: 16000 }] }));
    const oct8 = (await getDailyHealth(db)).find((d) => d.date === '2026-10-08');
    expect(oct8?.steps).toBe(16000);
    expect(oct8?.sleepHours).toBe(7.5);
    expect(oct8?.hrvSDNN).toBe(65);
  });
});

describe('backup', () => {
  it('round-trips every store', async () => {
    await seedIfEmpty(db);
    await importHealth(db, parseHealthPayload(fixture));
    const json = JSON.stringify(await exportBackup(db));

    const other = await Database.open(new IDBFactory(), 'restore');
    await restoreBackup(other, json);
    expect(await other.exportAll()).toEqual(await db.exportAll());
  });

  it('rejects files that are not FitPlan backups', async () => {
    await expect(restoreBackup(db, '{"foo":1}')).rejects.toThrow(/FitPlan/);
    await expect(restoreBackup(db, 'nope')).rejects.toThrow(/válida/);
  });
});
