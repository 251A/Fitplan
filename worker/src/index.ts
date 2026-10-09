// FitPlan sync Worker.
//   GET  /health-check                 → "ok" (no auth)
//   POST /health    body: HealthPayload → stores raw payload (used by the iOS shortcut)
//   POST /sync      body: { since, changes } → { seq, changes, payloads }
// All routes except /health-check require `Authorization: Bearer <SYNC_TOKEN>`.

export interface Env {
  DB: D1Database;
  SYNC_TOKEN: string;
  ALLOWED_ORIGINS: string; // comma separated
}

export interface RecordChange {
  store: string;
  key: string;
  value: unknown | null; // null = deleted
  updatedAt: number;
}

interface SyncRequest {
  since: number;
  changes: RecordChange[];
}

const SYNCED_STORES = new Set(['exercises', 'gymSessions', 'seedBestSets', 'weekPlans', 'kv']);
const MAX_BODY_BYTES = 5_000_000;
const PAYLOAD_RETENTION_MS = 120 * 24 * 3600_000;

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Constant-time comparison of the bearer token. */
async function authorized(req: Request, env: Env): Promise<boolean> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!env.SYNC_TOKEN || !token) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(token)),
    crypto.subtle.digest('SHA-256', enc.encode(env.SYNC_TOKEN)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

async function nextSeq(db: D1Database): Promise<number> {
  const row = await db.prepare('UPDATE meta SET seq = seq + 1 WHERE id = 1 RETURNING seq').first<{ seq: number }>();
  if (!row) throw new Error('meta row missing: run schema.sql');
  return row.seq;
}

async function readBody(req: Request): Promise<string> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Payload too large');
  return text;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handleHealth(req: Request, env: Env): Promise<unknown> {
  const body = await readBody(req);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Body is not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new HttpError(400, 'Not a FitPlan HealthPayload');
  }
  const seq = await nextSeq(env.DB);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO health_payloads (seq, received_at, body) VALUES (?, ?, ?)').bind(seq, now, body),
    env.DB.prepare('DELETE FROM health_payloads WHERE received_at < ?').bind(now - PAYLOAD_RETENTION_MS),
  ]);
  return { ok: true, seq };
}

async function handleSync(req: Request, env: Env): Promise<unknown> {
  let body: SyncRequest;
  try {
    body = JSON.parse(await readBody(req)) as SyncRequest;
  } catch {
    throw new HttpError(400, 'Body is not JSON');
  }
  const since = Number.isFinite(body.since) ? body.since : 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  for (const c of changes) {
    if (!SYNCED_STORES.has(c.store) || typeof c.key !== 'string' || !Number.isFinite(c.updatedAt)) {
      throw new HttpError(400, `Invalid change for store ${String(c.store)}`);
    }
  }

  if (changes.length > 0) {
    const seq = await nextSeq(env.DB);
    // Last write wins: only overwrite when the incoming change is newer.
    const upsert = env.DB.prepare(
      `INSERT INTO records (store, key, value, updated_at, seq) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (store, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, seq = excluded.seq
       WHERE excluded.updated_at >= records.updated_at`,
    );
    await env.DB.batch(
      changes.map((c) =>
        upsert.bind(c.store, c.key, c.value === null ? null : JSON.stringify(c.value), c.updatedAt, seq),
      ),
    );
  }

  const [records, payloads, meta] = await Promise.all([
    env.DB.prepare('SELECT store, key, value, updated_at FROM records WHERE seq > ? ORDER BY seq')
      .bind(since)
      .all<{ store: string; key: string; value: string | null; updated_at: number }>(),
    env.DB.prepare('SELECT seq, received_at, body FROM health_payloads WHERE seq > ? ORDER BY seq')
      .bind(since)
      .all<{ seq: number; received_at: number; body: string }>(),
    env.DB.prepare('SELECT seq FROM meta WHERE id = 1').first<{ seq: number }>(),
  ]);

  // Also return the winning row for every pushed key, so a client whose write lost
  // (older updatedAt) converges to the server value even if that row is below `since`.
  const rows = [...records.results];
  const seen = new Set(rows.map((r) => `${r.store}|${r.key}`));
  const pending = changes.filter((c) => !seen.has(`${c.store}|${c.key}`));
  if (pending.length > 0) {
    const get = env.DB.prepare('SELECT store, key, value, updated_at FROM records WHERE store = ? AND key = ?');
    const winners = await env.DB.batch<{ store: string; key: string; value: string | null; updated_at: number }>(
      pending.map((c) => get.bind(c.store, c.key)),
    );
    for (const w of winners) {
      const r = w.results[0];
      if (r && !seen.has(`${r.store}|${r.key}`)) {
        seen.add(`${r.store}|${r.key}`);
        rows.push(r);
      }
    }
  }

  return {
    seq: meta?.seq ?? 0,
    changes: rows.map((r) => ({
      store: r.store,
      key: r.key,
      value: r.value === null ? null : JSON.parse(r.value),
      updatedAt: r.updated_at,
    })),
    payloads: payloads.results.map((p) => ({ seq: p.seq, receivedAt: p.received_at, body: p.body })),
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(req, env);
    const { pathname } = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method === 'GET' && pathname === '/health-check') return json({ ok: true }, 200, headers);
    if (!(await authorized(req, env))) return json({ error: 'Unauthorized' }, 401, headers);

    try {
      if (req.method === 'POST' && pathname === '/health') return json(await handleHealth(req, env), 200, headers);
      if (req.method === 'POST' && pathname === '/sync') return json(await handleSync(req, env), 200, headers);
      return json({ error: 'Not found' }, 404, headers);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, headers);
      console.error(e);
      return json({ error: 'Internal error' }, 500, headers);
    }
  },
} satisfies ExportedHandler<Env>;
