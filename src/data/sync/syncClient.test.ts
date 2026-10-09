import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { Database, type RecordChange } from '../db/db';
import { getDailyHealth, getProfile, importPersonalSeed, saveProfile, seedIfEmpty } from '../db/repository';
import fixture from '../health/__fixtures__/payload-es.json';
import personalSeed from '../db/__fixtures__/personal-seed-sample.json';
import { syncNow, SyncError, type SyncConfig } from './syncClient';

/** In-memory twin of the Worker's semantics (seq counter, last write wins, winner echo). */
class FakeServer {
  seq = 0;
  records = new Map<string, RecordChange & { seq: number }>();
  payloads: Array<{ seq: number; receivedAt: number; body: string }> = [];
  token = 'secret';

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (init?.headers && (init.headers as Record<string, string>).Authorization !== `Bearer ${this.token}`) {
      return new Response('{}', { status: 401 });
    }
    const body = JSON.parse(String(init?.body));
    if (url.pathname === '/health') {
      this.payloads.push({ seq: ++this.seq, receivedAt: Date.now(), body: String(init?.body) });
      return Response.json({ ok: true });
    }
    const { since, changes } = body as { since: number; changes: RecordChange[] };
    if (changes.length > 0) {
      const seq = ++this.seq;
      for (const c of changes) {
        const id = `${c.store}|${c.key}`;
        const cur = this.records.get(id);
        if (!cur || c.updatedAt >= cur.updatedAt) this.records.set(id, { ...c, seq });
      }
    }
    const out = [...this.records.values()].filter((r) => r.seq > since);
    for (const c of changes) {
      const r = this.records.get(`${c.store}|${c.key}`)!;
      if (!out.includes(r)) out.push(r);
    }
    return Response.json({
      seq: this.seq,
      changes: out.map(({ seq: _seq, ...r }) => r),
      payloads: this.payloads.filter((p) => p.seq > since),
    });
  };
}

let server: FakeServer;
let phone: Database;
let laptop: Database;
const cfg: SyncConfig = { url: 'https://sync.test', token: 'secret' };
const sync = (db: Database) => syncNow(db, cfg, { fetch: server.fetch, timeZone: 'Europe/Madrid' });

beforeEach(async () => {
  server = new FakeServer();
  phone = await Database.open(new IDBFactory(), 'phone');
  laptop = await Database.open(new IDBFactory(), 'laptop');
  await seedIfEmpty(phone);
  await seedIfEmpty(laptop);
});

describe('syncNow', () => {
  it('propagates the personal seed and profile edits between devices', async () => {
    await importPersonalSeed(phone, JSON.stringify(personalSeed));
    expect((await sync(phone)).pushed).toBeGreaterThan(0);
    expect((await phone.getOutbox()).length).toBe(0);

    await sync(laptop);
    expect((await getProfile(laptop))?.hrMaxObserved).toBe(185);
    expect((await laptop.getAll('gymSessions')).length).toBe(3);
    expect((await laptop.getAll('seedBestSets')).length).toBe(2);

    const p = (await getProfile(laptop))!;
    await saveProfile(laptop, { ...p, stepGoal: 12000 });
    await sync(laptop);
    await sync(phone);
    expect((await getProfile(phone))?.stepGoal).toBe(12000);
  });

  it('imports Health payloads sent by the shortcut on every device', async () => {
    await server.fetch('https://sync.test/health', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify(fixture),
    });
    expect((await sync(laptop)).payloadsImported).toBe(1);
    expect((await sync(laptop)).payloadsImported).toBe(0); // cursor advanced
    await sync(phone);
    for (const db of [phone, laptop]) {
      expect((await getDailyHealth(db)).find((d) => d.date === '2026-10-08')?.sleepHours).toBe(7.5);
    }
  });

  it('last write wins: an older offline edit does not overwrite a newer one', async () => {
    const base = (await getProfile(phone))!;
    await phone.writeSynced([{ store: 'kv', key: 'profile', value: { ...base, stepGoal: 9000 } }], 1000);
    await laptop.writeSynced([{ store: 'kv', key: 'profile', value: { ...base, stepGoal: 11000 } }], 2000);
    await sync(laptop);
    await sync(phone); // phone pushes the older edit, server keeps the newer and echoes it back
    expect((await getProfile(phone))?.stepGoal).toBe(11000);
    expect((await getProfile(laptop))?.stepGoal).toBe(11000);
  });

  it('keeps the outbox and reports a Spanish error when the token is wrong', async () => {
    await saveProfile(phone, { ...(await getProfile(phone))!, stepGoal: 8000 });
    await expect(syncNow(phone, { ...cfg, token: 'bad' }, { fetch: server.fetch })).rejects.toThrow(SyncError);
    expect((await phone.getOutbox()).length).toBe(1);
  });
});
