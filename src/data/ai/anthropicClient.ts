// Minimal Anthropic Messages API client over fetch (spec section 11; no SDK by design).
// Runs in the browser: the user's own API key, stored only on the device, sent straight to Anthropic.

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Models that accept server-side refusal fallbacks with the "default" routing. */
const DEFAULT_FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

const API_URL = 'https://api.anthropic.com/v1/messages';

export type ClaudeErrorKind = 'auth' | 'rate' | 'overloaded' | 'network' | 'timeout' | 'refusal' | 'bad_request' | 'server' | 'truncated';

export class ClaudeError extends Error {
  constructor(
    readonly kind: ClaudeErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface ContentBlock {
  type: string;
  text?: string;
}

export interface MessageResponse {
  id: string;
  model: string;
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string } | null;
  content: ContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
}

export interface MessageRequest {
  max_tokens: number;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
  output_config?: Record<string, unknown>;
}

export interface CallOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  /** Injected in tests to avoid real waiting. */
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

function errorFor(status: number, body: string): ClaudeError {
  let detail = '';
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    /* not JSON */
  }
  if (status === 401 || status === 403) return new ClaudeError('auth', 'La API key de Anthropic no es válida o no tiene permiso. Revísala en Ajustes.', status);
  if (status === 429) return new ClaudeError('rate', 'Demasiadas peticiones a Claude. Espera un minuto y vuelve a intentarlo.', status);
  if (status === 529) return new ClaudeError('overloaded', 'Claude está saturado ahora mismo. Inténtalo en unos minutos.', status);
  if (status === 400 || status === 404 || status === 413) {
    return new ClaudeError('bad_request', `Petición rechazada por la API${detail ? `: ${detail}` : ''}.`, status);
  }
  return new ClaudeError('server', `Error del servidor de Anthropic (${status}).`, status);
}

export async function createMessage(cfg: ClaudeConfig, req: MessageRequest, opts: CallOptions = {}): Promise<MessageResponse> {
  if (!cfg.apiKey) throw new ClaudeError('auth', 'Falta la API key de Anthropic. Añádela en Ajustes.');
  const fetchImpl = opts.fetch ?? fetch;
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const useFallbacks = DEFAULT_FALLBACK_MODELS.has(cfg.model);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (useFallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  const body = JSON.stringify({ model: cfg.model, ...req, ...(useFallbacks ? { fallbacks: 'default' } : {}) });

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
    let res: Response;
    try {
      res = await fetchImpl(API_URL, { method: 'POST', headers, body, signal: ctrl.signal });
    } catch {
      clearTimeout(timer);
      const err = ctrl.signal.aborted
        ? new ClaudeError('timeout', 'Claude tardó demasiado en responder.')
        : new ClaudeError('network', 'Sin conexión con Anthropic. Comprueba tu conexión a internet.');
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw err;
    }
    clearTimeout(timer);

    if (res.ok) {
      const msg = (await res.json()) as MessageResponse;
      if (msg.stop_reason === 'refusal') {
        throw new ClaudeError('refusal', 'Claude no ha querido procesar esta imagen. Revísala o introdúcela a mano.');
      }
      if (msg.stop_reason === 'max_tokens') {
        throw new ClaudeError('truncated', 'La respuesta de Claude quedó cortada.');
      }
      return msg;
    }

    const text = await res.text();
    if (RETRYABLE.has(res.status) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    throw errorFor(res.status, text);
  }
}

/** Text of the response (structured outputs arrive as one text block with the JSON). */
export function responseText(msg: MessageResponse): string {
  return msg.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}
