// Minimal promise wrapper around IndexedDB (no third-party library).

export const DB_NAME = 'fitplan';
export const DB_VERSION = 2;

export const STORES = {
  dailyHealth: 'dailyHealth', // key: date (derived from Health payloads, not synced)
  healthWorkouts: 'healthWorkouts', // key: id (derived from Health payloads, not synced)
  exercises: 'exercises', // key: id (synced)
  gymSessions: 'gymSessions', // key: id (synced)
  seedBestSets: 'seedBestSets', // key: id (synced)
  kv: 'kv', // out-of-line key: profile (synced), local settings, sync state
  outbox: 'outbox', // out-of-line key "store|key": local changes not yet pushed
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];
export type SyncedStore = 'exercises' | 'gymSessions' | 'seedBestSets' | 'kv';

/** Stores whose records carry their own key in `id`/`date`. */
const KEY_PATH: Partial<Record<StoreName, string>> = {
  dailyHealth: 'date',
  healthWorkouts: 'id',
  exercises: 'id',
  gymSessions: 'id',
  seedBestSets: 'id',
};
const OUT_OF_LINE = new Set<StoreName>([STORES.kv, STORES.outbox]);

/** A change to one record; `value: null` means deleted. Same shape the sync server uses. */
export interface RecordChange {
  store: SyncedStore;
  key: string;
  value: unknown | null;
  updatedAt: number;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción cancelada'));
  });
}

function writeRecord(os: IDBObjectStore, store: StoreName, key: string, value: unknown | null) {
  if (value === null) os.delete(key);
  else if (OUT_OF_LINE.has(store)) os.put(value, key);
  else os.put(value);
}

export class Database {
  /** Called after every local synced write (used to schedule a sync). */
  onLocalChange?: () => void;

  private constructor(private readonly idb: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB, name: string = DB_NAME): Promise<Database> {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const old = ev.oldVersion;
      if (old < 1) {
        db.createObjectStore(STORES.dailyHealth, { keyPath: 'date' });
        db.createObjectStore(STORES.healthWorkouts, { keyPath: 'id' });
        db.createObjectStore(STORES.exercises, { keyPath: 'id' });
        db.createObjectStore(STORES.gymSessions, { keyPath: 'id' });
        db.createObjectStore(STORES.kv);
      }
      if (old < 2) {
        // v1 used auto-increment keys, which differ between devices and can't be synced.
        if (db.objectStoreNames.contains(STORES.seedBestSets)) db.deleteObjectStore(STORES.seedBestSets);
        db.createObjectStore(STORES.seedBestSets, { keyPath: 'id' });
        db.createObjectStore(STORES.outbox);
      }
    };
    return new Database(await request(req));
  }

  close(): void {
    this.idb.close();
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const tx = this.idb.transaction(store, 'readonly');
    return request(tx.objectStore(store).getAll() as IDBRequest<T[]>);
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const tx = this.idb.transaction(store, 'readonly');
    return request(tx.objectStore(store).get(key) as IDBRequest<T | undefined>);
  }

  /** Local-only write (no sync). */
  async putMany(store: StoreName, values: unknown[]): Promise<void> {
    const tx = this.idb.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const v of values) os.put(v);
    await done(tx);
  }

  async clear(store: StoreName): Promise<void> {
    const tx = this.idb.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    await done(tx);
  }

  async getKV<T>(key: string): Promise<T | undefined> {
    return this.get<T>(STORES.kv, key);
  }

  /** Local-only KV write (device settings, sync state). */
  async setKV(key: string, value: unknown): Promise<void> {
    const tx = this.idb.transaction(STORES.kv, 'readwrite');
    tx.objectStore(STORES.kv).put(value, key);
    await done(tx);
  }

  /** Key of a record in a synced store. */
  static keyOf(store: SyncedStore, value: unknown): string {
    const path = KEY_PATH[store];
    if (!path) throw new Error(`Store ${store} has out-of-line keys`);
    return String((value as Record<string, unknown>)[path]);
  }

  /** Writes records and queues them for sync, atomically. */
  async writeSynced(changes: Array<Omit<RecordChange, 'updatedAt'>>, now: number = Date.now()): Promise<void> {
    if (changes.length === 0) return;
    const stores = [...new Set(changes.map((c) => c.store))];
    const tx = this.idb.transaction([...stores, STORES.outbox], 'readwrite');
    const outbox = tx.objectStore(STORES.outbox);
    for (const c of changes) {
      writeRecord(tx.objectStore(c.store), c.store, c.key, c.value);
      outbox.put({ ...c, updatedAt: now } satisfies RecordChange, `${c.store}|${c.key}`);
    }
    await done(tx);
    this.onLocalChange?.();
  }

  async getOutbox(): Promise<RecordChange[]> {
    return this.getAll<RecordChange>(STORES.outbox);
  }

  /** Removes pushed entries, unless they were modified again while the push was in flight. */
  async ackOutbox(pushed: RecordChange[]): Promise<void> {
    const tx = this.idb.transaction(STORES.outbox, 'readwrite');
    const os = tx.objectStore(STORES.outbox);
    for (const c of pushed) {
      const id = `${c.store}|${c.key}`;
      const current = await request(os.get(id) as IDBRequest<RecordChange | undefined>);
      if (current && current.updatedAt === c.updatedAt) os.delete(id);
    }
    await done(tx);
  }

  /** Applies changes coming from the server; local pending changes that are newer win. */
  async applyRemote(changes: RecordChange[]): Promise<number> {
    if (changes.length === 0) return 0;
    const stores = [...new Set(changes.map((c) => c.store))];
    const tx = this.idb.transaction([...stores, STORES.outbox], 'readwrite');
    const outbox = tx.objectStore(STORES.outbox);
    let applied = 0;
    for (const c of changes) {
      const pending = await request(outbox.get(`${c.store}|${c.key}`) as IDBRequest<RecordChange | undefined>);
      if (pending && pending.updatedAt > c.updatedAt) continue;
      writeRecord(tx.objectStore(c.store), c.store, c.key, c.value);
      applied++;
    }
    await done(tx);
    return applied;
  }

  /** Dumps every store (out-of-line stores as [key, value] pairs). */
  async exportAll(): Promise<Record<StoreName, unknown[]>> {
    const out = {} as Record<StoreName, unknown[]>;
    for (const store of Object.values(STORES)) {
      if (OUT_OF_LINE.has(store)) {
        const tx = this.idb.transaction(store, 'readonly');
        const os = tx.objectStore(store);
        const [keys, values] = await Promise.all([request(os.getAllKeys()), request(os.getAll())]);
        out[store] = keys.map((k, i) => [k, values[i]]);
      } else {
        out[store] = await this.getAll(store);
      }
    }
    return out;
  }

  /** Replaces every store with the given dump, atomically. */
  async replaceAll(dump: Partial<Record<StoreName, unknown[]>>): Promise<void> {
    const names = Object.values(STORES);
    const tx = this.idb.transaction(names, 'readwrite');
    for (const store of names) {
      const os = tx.objectStore(store);
      os.clear();
      for (const item of dump[store] ?? []) {
        if (OUT_OF_LINE.has(store)) {
          const [k, v] = item as [IDBValidKey, unknown];
          os.put(v, k);
        } else {
          os.put(item);
        }
      }
    }
    await done(tx);
  }
}
