import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DailyHealth } from '../domain/health/dailyMetrics';
import { Database, STORES } from '../data/db/db';
import type { Exercise, GymSession, HealthWorkout, SeedBestSet, SyncInfo, UserProfile } from '../data/db/models';
import {
  getDailyHealth,
  getLastSync,
  getProfile,
  getWorkouts,
  seedIfEmpty,
} from '../data/db/repository';

export interface AppState {
  db: Database;
  profile?: UserProfile;
  days: DailyHealth[];
  workouts: HealthWorkout[];
  exercises: Exercise[];
  gymSessions: GymSession[];
  bestSets: SeedBestSet[];
  lastSync?: SyncInfo;
  timeZone: string;
  reload: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useAppData(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData outside AppDataProvider');
  return v;
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>();
  const [error, setError] = useState<string>();
  const [state, setState] = useState<Omit<AppState, 'db' | 'reload' | 'timeZone'>>({
    days: [],
    workouts: [],
    exercises: [],
    gymSessions: [],
    bestSets: [],
  });

  const load = useCallback(async (d: Database) => {
    const [profile, days, workouts, exercises, gymSessions, bestSets, lastSync] = await Promise.all([
      getProfile(d),
      getDailyHealth(d),
      getWorkouts(d),
      d.getAll<Exercise>(STORES.exercises),
      d.getAll<GymSession>(STORES.gymSessions),
      d.getAll<SeedBestSet>(STORES.seedBestSets),
      getLastSync(d),
    ]);
    setState({ profile, days, workouts, exercises, gymSessions, bestSets, lastSync });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const d = await Database.open();
        await seedIfEmpty(d);
        // Ask Safari not to evict our data (best effort; home-screen apps are usually exempt).
        await navigator.storage?.persist?.().catch(() => false);
        await load(d);
        setDb(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [load]);

  if (error) return <div className="fatal">No se pudo abrir la base de datos: {error}</div>;
  if (!db) return <div className="loading">Cargando…</div>;

  return (
    <Ctx.Provider value={{ ...state, db, timeZone, reload: () => load(db) }}>{children}</Ctx.Provider>
  );
}
