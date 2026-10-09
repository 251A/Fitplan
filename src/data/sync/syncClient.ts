// Client for the FitPlan sync Worker (worker/src/index.ts).
// User-edited records travel as RecordChanges (last write wins). Health data travels as the raw
// payloads the shortcut sent; every device imports them locally, so derived data stays identical.

import { DEFAULT_TIME_ZONE } from '../../domain/dates';
import type { Database, RecordChange } from '../db/db';
import { importHealth } from '../db/repository';
import { PAYLOAD_PARSER_VERSION, parseHealthPayload } from '../health/payload';

export interface SyncConfig {
  url: string; // e.g. https://fitplan-sync.<account>.workers.dev
  token: string;
}

export interface SyncState {
  seq: number;
  parserVersion?: number;
  lastOkMs?: number;
  lastError?: string;
  lastResult?: SyncResult;
  /** Problems found reading the Health payloads of the last sync that brought any. */
  lastWarnings?: string[];
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  payloadsImported: number;
  payloadErrors: number;
}

interface SyncResponse {
  seq: number;
  changes: RecordChange[];
  payloads: Array<{ seq: number; receivedAt: number; body: string }>;
}

export class SyncError extends Error {}

const KV_CONFIG = 'syncConfig';
const KV_STATE = 'syncState';
const TIMEOUT_MS = 20_000;

export const getSyncConfig = (db: Database) => db.getKV<SyncConfig>(KV_CONFIG);
export const getSyncState = async (db: Database): Promise<SyncState> =>
  (await db.getKV<SyncState>(KV_STATE)) ?? { seq: 0 };

export async function saveSyncConfig(db: Database, cfg: SyncConfig | null): Promise<void> {
  if (cfg === null) {
    await db.setKV(KV_CONFIG, undefined);
    return;
  }
  await db.setKV(KV_CONFIG, { url: cfg.url.trim().replace(/\/+$/, ''), token: cfg.token.trim() });
  // A new server means starting again from scratch.
  await db.setKV(KV_STATE, { seq: 0 } satisfies SyncState);
}

async function call<T>(cfg: SyncConfig, path: string, body: string, fetchImpl: typeof fetch): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new SyncError(
      ctrl.signal.aborted ? 'El servidor de sincronización no responde.' : 'Sin conexión con el servidor de sincronización.',
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new SyncError('Clave de sincronización incorrecta.');
  if (!res.ok) throw new SyncError(`Error del servidor de sincronización (${res.status}).`);
  return (await res.json()) as T;
}

/** Uploads a Health payload pasted in the app so other devices receive it too. */
export async function pushHealthPayload(
  cfg: SyncConfig,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await call(cfg, '/health', body, fetchImpl);
}

export async function syncNow(
  db: Database,
  cfg: SyncConfig,
  opts: { fetch?: typeof fetch; timeZone?: string } = {},
): Promise<SyncResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const state = await getSyncState(db);
  // A newer parser reads more from the same payloads: pull everything again (imports are idempotent).
  const since = state.parserVersion === PAYLOAD_PARSER_VERSION ? state.seq : 0;
  try {
    const outbox = await db.getOutbox();
    const res = await call<SyncResponse>(cfg, '/sync', JSON.stringify({ since, changes: outbox }), fetchImpl);
    await db.ackOutbox(outbox);
    const pulled = await db.applyRemote(res.changes);

    let payloadsImported = 0;
    let payloadErrors = 0;
    const warnings = new Set<string>();
    for (const p of res.payloads) {
      try {
        const parsed = parseHealthPayload(p.body);
        parsed.warnings.forEach((w) => warnings.add(w));
        await importHealth(db, parsed, opts.timeZone ?? DEFAULT_TIME_ZONE, p.receivedAt);
        payloadsImported++;
      } catch (e) {
        payloadErrors++;
        warnings.add(e instanceof Error ? e.message : String(e));
      }
    }

    const result: SyncResult = { pushed: outbox.length, pulled, payloadsImported, payloadErrors };
    await db.setKV(KV_STATE, {
      seq: res.seq,
      parserVersion: PAYLOAD_PARSER_VERSION,
      lastOkMs: Date.now(),
      lastResult: result,
      // Keep the previous warnings when nothing new arrived, so they stay visible in Ajustes.
      lastWarnings: res.payloads.length > 0 ? [...warnings] : state.lastWarnings,
    } satisfies SyncState);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.setKV(KV_STATE, { ...state, lastError: msg } satisfies SyncState);
    throw e;
  }
}
