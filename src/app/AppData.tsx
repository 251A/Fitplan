import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DailyHealth } from '../domain/health/dailyMetrics';
import { DEFAULT_RECOVERY_CONFIG, type RecoveryConfig } from '../domain/recovery/recoveryConfig';
import { Database, STORES } from '../data/db/db';
import type { Exercise, GymSession, HealthWorkout, SeedBestSet, SyncInfo, UserProfile } from '../data/db/models';
import {
  getDailyHealth,
  getLastSync,
  getProfile,
  getRecoveryConfig,
  getWorkouts,
  repairStoredText,
  seedIfEmpty,
} from '../data/db/repository';
import { getSyncConfig, getSyncState, syncNow, type SyncConfig, type SyncState } from '../data/sync/syncClient';

export interface CloudSync {
  config?: SyncConfig;
  state?: SyncState;
  running: boolean;
  run: () => Promise<void>;
}

export interface AppState {
  db: Database;
  profile?: UserProfile;
  days: DailyHealth[];
  workouts: HealthWorkout[];
  exercises: Exercise[];
  gymSessions: GymSession[];
  bestSets: SeedBestSet[];
  lastSync?: SyncInfo;
  recoveryConfig: RecoveryConfig;
  timeZone: string;
  cloud: CloudSync;
  reload: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useAppData(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData outside AppDataProvider');
  return v;
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
const PERIODIC_SYNC_MS = 5 * 60_000;
const LOCAL_CHANGE_DEBOUNCE_MS = 2_000;

type Data = Omit<AppState, 'db' | 'reload' | 'timeZone' | 'cloud'> & {
  syncConfig?: SyncConfig;
  syncState?: SyncState;
};

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [data, setData] = useState<Data>({
    days: [],
    workouts: [],
    exercises: [],
    gymSessions: [],
    bestSets: [],
    recoveryConfig: DEFAULT_RECOVERY_CONFIG,
  });

  const load = useCallback(async (d: Database) => {
    const [profile, days, workouts, exercises, gymSessions, bestSets, lastSync, syncConfig, syncState, recoveryConfig] =
      await Promise.all([
        getProfile(d),
        getDailyHealth(d),
        getWorkouts(d),
        d.getAll<Exercise>(STORES.exercises),
        d.getAll<GymSession>(STORES.gymSessions),
        d.getAll<SeedBestSet>(STORES.seedBestSets),
        getLastSync(d),
        getSyncConfig(d),
        getSyncState(d),
        getRecoveryConfig(d),
      ]);
    setData({
      profile,
      days,
      workouts,
      exercises,
      gymSessions,
      bestSets,
      lastSync,
      syncConfig,
      syncState,
      recoveryConfig,
    });
  }, []);

  const runSync = useCallback(
    async (d: Database) => {
      const cfg = await getSyncConfig(d);
      if (!cfg || runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      try {
        await syncNow(d, cfg, { timeZone });
      } catch {
        // The error is stored in the sync state and shown in Ajustes.
      } finally {
        runningRef.current = false;
        setRunning(false);
        await load(d);
      }
    },
    [load],
  );

  useEffect(() => {
    (async () => {
      try {
        const d = await Database.open();
        await seedIfEmpty(d);
        await repairStoredText(d);
        // Ask Safari not to evict our data (best effort; home-screen apps are usually exempt).
        await navigator.storage?.persist?.().catch(() => false);
        await load(d);
        setDb(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [load]);

  // Automatic sync: on start, when the app comes back to the foreground, after local edits
  // (debounced) and periodically while open.
  useEffect(() => {
    if (!db) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    db.onLocalChange = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void runSync(db), LOCAL_CHANGE_DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync(db);
    };
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('online', onVisible);
    const timer = setInterval(() => void runSync(db), PERIODIC_SYNC_MS);
    void runSync(db);
    return () => {
      db.onLocalChange = undefined;
      clearTimeout(debounce);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('online', onVisible);
    };
  }, [db, runSync]);

  if (error) return <div className="fatal">No se pudo abrir la base de datos: {error}</div>;
  if (!db) return <div className="loading">Cargando…</div>;

  const { syncConfig, syncState, ...rest } = data;
  return (
    <Ctx.Provider
      value={{
        ...rest,
        db,
        timeZone,
        cloud: { config: syncConfig, state: syncState, running, run: () => runSync(db) },
        reload: () => load(db),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
