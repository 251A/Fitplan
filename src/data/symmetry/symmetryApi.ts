import type { GymSession } from '../db/models';
import { findSymmetryExercise } from './symmetryCatalog';

const STORAGE_KEY = 'symmetry_auth';

export interface SymmetryAuth {
  accessToken: string;
  refreshToken?: string;
  email?: string;
  userId?: string | number;
  lastConnectedAt?: number;
}

export function getStoredSymmetryAuth(): SymmetryAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SymmetryAuth) : null;
  } catch {
    return null;
  }
}

export function saveSymmetryAuth(auth: SymmetryAuth | null): void {
  if (!auth) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  }
}

export function isSymmetryConnected(): boolean {
  const auth = getStoredSymmetryAuth();
  return Boolean(auth && auth.accessToken);
}

export function getWorkerBaseUrl(): string {
  // Uses Vite env, or current origin, or localhost for dev worker
  const override = localStorage.getItem('worker_url');
  if (override) return override.replace(/\/$/, '');
  return '';
}

/** Login to Symmetry backend via Cloudflare Worker proxy */
export async function loginToSymmetry(
  email: string,
  pass: string,
  workerBase = getWorkerBaseUrl(),
): Promise<{ ok: boolean; error?: string; auth?: SymmetryAuth }> {
  try {
    const endpoint = `${workerBase}/symmetry/login`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = typeof data.error === 'object' ? JSON.stringify(data.error) : (data.error as string) || (data.detail as string) || 'Error de inicio de sesión';
      return { ok: false, error: err };
    }

    const accessToken = (data.access_token as string) || (data.access as string) || (data.token as string);
    const refreshToken = (data.refresh_token as string) || (data.refresh as string);
    const user = data.user as Record<string, unknown> | undefined;

    if (!accessToken) {
      return { ok: false, error: 'No se recibió access_token del servidor' };
    }

    const auth: SymmetryAuth = {
      accessToken,
      refreshToken,
      email,
      userId: user?.id as string | number | undefined,
      lastConnectedAt: Date.now(),
    };
    saveSymmetryAuth(auth);
    return { ok: true, auth };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Error de conexión' };
  }
}

/** Logs out and clears token */
export function logoutSymmetry(): void {
  saveSymmetryAuth(null);
}

/** Pushes a completed GymSession to Symmetry */
export async function pushWorkoutToSymmetry(
  session: GymSession,
  workerBase = getWorkerBaseUrl(),
): Promise<{ ok: boolean; error?: string; remoteId?: string | number }> {
  const auth = getStoredSymmetryAuth();
  if (!auth?.accessToken) {
    return { ok: false, error: 'No has iniciado sesión en Symmetry' };
  }

  try {
    // Group sets by exercise
    const setsByEx = new Map<string, typeof session.sets>();
    for (const set of session.sets) {
      if (set.skipped) continue;
      const list = setsByEx.get(set.exerciseId) ?? [];
      list.push(set);
      setsByEx.set(set.exerciseId, list);
    }

    const exercisesPayload = [];
    for (const [exNameOrId, sets] of setsByEx.entries()) {
      const symEx = findSymmetryExercise(exNameOrId);
      const exTemplateId = symEx ? symEx.id : 1; // Fallback to template 1 if custom

      exercisesPayload.push({
        exerciseTemplateId: exTemplateId,
        exerciseName: symEx?.name ?? exNameOrId,
        sets: sets.map((s) => ({
          weight: s.weightKg,
          reps: s.reps,
          restSeconds: 90,
          rir: s.rir ?? null,
        })),
      });
    }

    const startDate = session.date ? new Date(`${session.date}T10:00:00Z`).toISOString() : new Date().toISOString();
    const durationSeconds = (session.durationMin || 45) * 60;

    const payload = {
      name: session.templateName || 'Entrenamiento',
      started_at: startDate,
      duration_seconds: durationSeconds,
      exercises: exercisesPayload,
      note: session.note || '',
    };

    const res = await fetch(`${workerBase}/symmetry/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Symmetry-Auth': `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: (data.error as string) || (data.detail as string) || `Error ${res.status}` };
    }

    return { ok: true, remoteId: (data.id as string | number) ?? 'created' };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Error de red' };
  }
}
