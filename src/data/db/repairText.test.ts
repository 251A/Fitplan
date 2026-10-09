import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { Database, STORES } from './db';
import type { Exercise, GymSession } from './models';
import { repairDeep, repairMojibake } from './repairText';
import { repairStoredText, seedIfEmpty } from './repository';

describe('repairMojibake', () => {
  it('reverses UTF-8 read as Windows-1252', () => {
    expect(repairMojibake('TracciÃ³n')).toBe('Tracción');
    expect(repairMojibake('Curl de bÃ­ceps')).toBe('Curl de bíceps');
    expect(repairMojibake('Prensa 45Â° (mÃ¡quina)')).toBe('Prensa 45° (máquina)');
  });
  it('leaves correct text alone', () => {
    expect(repairMojibake('Tracción')).toBe('Tracción');
    expect(repairDeep({ a: ['Pierna'] })).toBeUndefined();
  });
});

describe('startup repair', () => {
  it('fixes stored sessions once and queues the fix for sync', async () => {
    const db = await Database.open(new IDBFactory(), 'repair');
    await db.putMany(STORES.gymSessions, [{ id: 's1', templateName: 'TracciÃ³n', sets: [] } as unknown as GymSession]);
    expect(await repairStoredText(db)).toBe(1);
    expect((await db.get<GymSession>(STORES.gymSessions, 's1'))?.templateName).toBe('Tracción');
    expect((await db.getOutbox()).length).toBe(1);
    expect(await repairStoredText(db)).toBe(0);
  });

  it('refreshes the library on a new version keeping learned aliases and load modes', async () => {
    const db = await Database.open(new IDBFactory(), 'upgrade');
    await db.putMany(STORES.exercises, [
      { id: 'concentration-curl-reverse', name: 'x', aliases: ['Mi alias'], loadMode: 'perDumbbell' } as unknown as Exercise,
    ]);
    await db.setKV('seedVersion', 1);
    expect(await seedIfEmpty(db)).toBe(true);
    const ex = await db.get<Exercise>(STORES.exercises, 'concentration-curl-reverse');
    expect(ex?.name).toBe('Curl de concentración agarre inverso');
    expect(ex?.aliases).toContain('Mi alias');
    expect(ex?.loadMode).toBe('perDumbbell');
    expect(await seedIfEmpty(db)).toBe(false);
  });
});
