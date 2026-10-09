// Minimal promise wrapper around IndexedDB (no third-party library).

export const DB_NAME = 'fitplan';
export const DB_VERSION = 1;

export const STORES = {
  dailyHealth: 'dailyHealth', // key: date
  healthWorkouts: 'healthWorkouts', // key: id
  exercises: 'exercises', // key: id
  gymSessions: 'gymSessions', // key: id
  seedBestSets: 'seedBestSets', // auto key
  kv: 'kv', // key: string (profile, settings, sync info…)
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

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

export class Database {
  private constructor(private readonly idb: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB, name: string = DB_NAME): Promise<Database> {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(STORES.dailyHealth, { keyPath: 'date' });
      db.createObjectStore(STORES.healthWorkouts, { keyPath: 'id' });
      db.createObjectStore(STORES.exercises, { keyPath: 'id' });
      db.createObjectStore(STORES.gymSessions, { keyPath: 'id' });
      db.createObjectStore(STORES.seedBestSets, { autoIncrement: true });
      db.createObjectStore(STORES.kv);
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

  async setKV(key: string, value: unknown): Promise<void> {
    const tx = this.idb.transaction(STORES.kv, 'readwrite');
    tx.objectStore(STORES.kv).put(value, key);
    await done(tx);
  }

  /** Dumps every store (KV entries as [key, value] pairs). */
  async exportAll(): Promise<Record<StoreName, unknown[]>> {
    const out = {} as Record<StoreName, unknown[]>;
    for (const store of Object.values(STORES)) {
      if (store === STORES.kv || store === STORES.seedBestSets) {
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
  async replaceAll(dump: Record<StoreName, unknown[]>): Promise<void> {
    const names = Object.values(STORES);
    const tx = this.idb.transaction(names, 'readwrite');
    for (const store of names) {
      const os = tx.objectStore(store);
      os.clear();
      for (const item of dump[store] ?? []) {
        if (store === STORES.kv || store === STORES.seedBestSets) {
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
