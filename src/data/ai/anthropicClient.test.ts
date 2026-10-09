import { describe, expect, it } from 'vitest';
import { extractPage } from '../import/screenshotImporter';
import { ExtractionError } from '../import/extraction';
import { ClaudeError, createMessage } from './anthropicClient';

const cfg = { apiKey: 'test-key', model: 'claude-sonnet-5-5' };
const noSleep = async () => {};
const ok = (content: unknown, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ id: 'm', model: cfg.model, stop_reason: 'end_turn', content, ...extra }), { status: 200 });

function recorder(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init! });
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  };
  return { calls, fetch };
}

describe('createMessage', () => {
  it('sends the browser-direct headers, the model and default refusal fallbacks', async () => {
    const { calls, fetch } = recorder([ok([{ type: 'text', text: 'hola' }])]);
    await createMessage(cfg, { max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }, { fetch });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default' });
  });

  it('omits fallbacks for models that do not support the default form', async () => {
    const { calls, fetch } = recorder([ok([])]);
    await createMessage({ ...cfg, model: 'claude-haiku-5-5' }, { max_tokens: 10, messages: [] }, { fetch });
    expect(JSON.parse(String(calls[0]!.init.body)).fallbacks).toBeUndefined();
  });

  it('retries overloaded / network errors and then succeeds', async () => {
    const { calls, fetch } = recorder([new Response('{}', { status: 529 }), new TypeError('offline'), ok([])]);
    await createMessage(cfg, { max_tokens: 10, messages: [] }, { fetch, sleep: noSleep });
    expect(calls).toHaveLength(3);
  });

  it('does not retry auth errors and explains them in Spanish', async () => {
    const { calls, fetch } = recorder([new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 })]);
    await expect(createMessage(cfg, { max_tokens: 10, messages: [] }, { fetch, sleep: noSleep })).rejects.toMatchObject({
      kind: 'auth',
      message: expect.stringContaining('API key'),
    });
    expect(calls).toHaveLength(1);
  });

  it('surfaces refusals as errors instead of reading content', async () => {
    const { fetch } = recorder([ok([], { stop_reason: 'refusal' })]);
    await expect(createMessage(cfg, { max_tokens: 10, messages: [] }, { fetch })).rejects.toBeInstanceOf(ClaudeError);
  });

  it('requires an API key', async () => {
    await expect(createMessage({ ...cfg, apiKey: '' }, { max_tokens: 1, messages: [] })).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('extractPage', () => {
  const image = { mediaType: 'image/jpeg' as const, data: 'AAAA' };
  const page = { kind: 'detail', has_header: false, header: null, exercises: [] };

  it('asks for structured output with the image first and validates the JSON', async () => {
    const { calls, fetch } = recorder([ok([{ type: 'text', text: JSON.stringify(page) }])]);
    const p = await extractPage(cfg, image, { fetch });
    expect(p.kind).toBe('detail');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content[0].type).toBe('image');
  });

  it('retries once on invalid output, then gives up for manual review', async () => {
    const bad = () => ok([{ type: 'text', text: '{"kind":"nope"}' }]);
    const { calls, fetch } = recorder([bad(), ok([{ type: 'text', text: JSON.stringify(page) }])]);
    await expect(extractPage(cfg, image, { fetch })).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);

    const second = recorder([bad(), bad()]);
    await expect(extractPage(cfg, image, { fetch: second.fetch })).rejects.toBeInstanceOf(ExtractionError);
  });
});
