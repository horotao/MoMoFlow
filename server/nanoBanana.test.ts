import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildNanoBananaRequest, nanoBananaPlugin, parseNanoBananaResult } from './nanoBanana.ts';
import { captureMiddleware } from './testMiddleware.ts';
import { defaultNanoBananaSettings, nanoBananaModel } from '../src/nodes/nanoBanana.ts';
const png = 'data:image/png;base64,aGVsbG8=';
const input = { ...defaultNanoBananaSettings, prompt: 'A green circle', images: [] };
const part = { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } };
const success = { candidates: [{ finishReason: 'STOP', content: { parts: [part] } }] };

async function invoke({ hook = 'configureServer', headers = {}, body = input, key = 'test-only', provider = async () => Response.json(success), method = 'POST' }: {
  hook?: 'configureServer' | 'configurePreviewServer'; headers?: Record<string, string | undefined>; body?: unknown; key?: string; provider?: typeof fetch; method?: string;
} = {}) {
  const handler = captureMiddleware(nanoBananaPlugin(key, provider), hook);
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url: '/api/nano-banana', method, headers: { host: 'localhost:5173', 'content-type': 'application/json', ...headers }, socket: {} });
  let status = 0; let text = '';
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, writeHead(code: number) { status = code; }, end(value: string) { text = value; this.writableEnded = true; } });
  const logs: Record<string, unknown>[] = [];
  const logger = mock.method(console, 'error', (prefix: string, entry: string) => {
    assert.equal(prefix, '[zenmux-nano-banana]');
    logs.push(JSON.parse(entry));
  });
  try { await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => assert.fail('unexpected next')); }
  finally { logger.mock.restore(); }
  return { status, body: JSON.parse(text), logs };
}

test('Gemini payload preserves ordered references and selected configuration without OpenAI fields', () => {
  const body = buildNanoBananaRequest({ ...input, images: [png, 'data:image/jpeg;base64,d29ybGQ='], aspectRatio: '16:9', imageSize: '4K', outputFormat: 'jpeg', model: 'wrong-model' });
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: input.prompt }, part, { inlineData: { mimeType: 'image/jpeg', data: 'd29ybGQ=' } }] }]);
  assert.deepEqual(body.generationConfig, { candidateCount: 1, responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '4K' } });
  assert.deepEqual(buildNanoBananaRequest(input).generationConfig.imageConfig, { imageSize: '1K' });
  assert.equal('model' in body, false);
  assert.equal('instances' in body, false);
  assert.equal('quality' in body.generationConfig.imageConfig, false);
});

test('PNG and JPEG selections never send unsupported format fields to the provider', async () => {
  for (const outputFormat of ['png', 'jpeg']) {
    for (const images of [[], [png]]) {
      let calls = 0;
      const result = await invoke({ body: { ...input, outputFormat, images }, provider: async (_url, options) => {
        calls++;
        const payload = JSON.parse(String(options?.body));
        const fields = Object.keys(payload.generationConfig.imageConfig);
        // Reproduce the provider's schema rejection, including the originally failing field.
        if (fields.some(field => !['aspectRatio', 'imageSize'].includes(field))) {
          return Response.json({ error: { message: 'Unknown name "outputMimeType" at generation_config.image_config: Cannot find field.' } }, { status: 400 });
        }
        return Response.json(success);
      } });
      assert.equal(result.status, 200); assert.equal(calls, 1);
      assert.equal(result.body.images[0].format, 'png');
    }
  }
});

test('invalid parameters, too many references, external URLs and large inputs reject before submission', () => {
  for (const value of [null, {}, { ...input, prompt: '' }, { ...input, prompt: 'a'.repeat(32001) },
    { ...input, aspectRatio: '1536x1024' }, { ...input, imageSize: '8K' }, { ...input, outputFormat: 'webp' },
    { ...input, images: ['http://localhost/private'] }, { ...input, images: Array(15).fill(png) },
    { ...input, images: ['data:image/png;base64,abc'] }, { ...input, images: [`data:image/png;base64,${'AAAA'.repeat(7 * 1024 * 1024)}`] },
  ]) assert.throws(() => buildNanoBananaRequest(value));
});

test('result parsing keeps every final image and ignores text and reasoning images', () => {
  const result = parseNanoBananaResult({ candidates: [{ content: { parts: [{ text: 'Done' }, { ...part, thought: true }, part, { inlineData: { mimeType: 'image/jpeg', data: 'd29ybGQ=' } }] }, finishReason: 'STOP' }] });
  assert.deepEqual(result.images, [{ image: png, format: 'png' }, { image: 'data:image/jpeg;base64,d29ybGQ=', format: 'jpeg' }]);
  for (const value of [null, { predictions: [] }, { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [part] } }] },
    { candidates: [{ content: { parts: [{ text: 'I cannot generate' }] } }] },
    { candidates: [{ content: { parts: [{ ...part, thought: true }] } }] },
    { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/svg+xml', data: 'aGVsbG8=' } }] } }] },
  ]) assert.throws(() => parseNanoBananaResult(value));
});

for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  test(`${hook}: uses fixed Nano Banana 2.1 generateContent route with server-only credentials`, async () => {
    let calls = 0;
    const result = await invoke({ hook, provider: async (url, options) => {
      calls++;
      assert.equal(url, `https://zenmux.ai/api/vertex-ai/v1/publishers/google/models/${nanoBananaModel.split('/')[1]}:generateContent`);
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-only');
      assert.deepEqual(JSON.parse(String(options?.body)), buildNanoBananaRequest(input));
      assert.ok(options?.signal);
      return Response.json(success);
    } });
    assert.equal(calls, 1); assert.equal(result.status, 200); assert.equal(result.body.images[0].image, png);
    assert.equal(JSON.stringify(result).includes('test-only'), false); assert.deepEqual(result.logs, []);
  });
  test(`${hook}: rejects untrusted hosts/origins, wrong methods, missing keys and invalid bodies`, async () => {
    const provider = async () => { assert.fail('must not submit'); };
    for (const headers of [{ origin: 'https://evil.example' }, { host: 'localhost.evil.example' }, { host: 'localhost:65536' }, { origin: 'null' }, { origin: 'http://localhost:5174' }]) assert.equal((await invoke({ hook, headers, provider })).status, 403);
    assert.equal((await invoke({ hook, key: '', provider })).status, 503);
    assert.equal((await invoke({ hook, method: 'GET', provider })).status, 405);
    assert.equal((await invoke({ hook, body: {}, provider })).status, 400);
    assert.equal((await invoke({ hook, headers: { 'content-type': 'text/plain' }, provider })).status, 415);
  });
}

test('provider failures preserve request IDs, redact secrets and never retry or fall back', async () => {
  const key = 'test-private-token';
  let calls = 0;
  const result = await invoke({ key, provider: async () => {
    calls++;
    return Response.json({ error: { code: 429, message: `Unavailable ${key} Bearer second-secret ${png}`, type: 'rate_limit' } }, { status: 429, headers: { 'x-zenmux-requestid': 'banana-123' } });
  } });
  assert.equal(calls, 1); assert.equal(result.status, 502);
  assert.match(result.body.error, /banana-123/);
  assert.equal(result.logs[0].stage, 'read-provider-error');
  for (const secret of [key, 'second-secret', png, input.prompt]) assert.equal(JSON.stringify(result).includes(secret), false);
  for (const response of [() => Response.json({ candidates: [] }), () => new Response('{broken'), () => { throw new Error(`Bearer ${key}`); }]) {
    calls = 0;
    const failed = await invoke({ key, provider: async () => { calls++; return response(); } });
    assert.equal(failed.status, 502); assert.equal(calls, 1);
    assert.equal(JSON.stringify(failed).includes(key), false);
  }
});

test('disconnect aborts only the submitted request and does not resubmit', async () => {
  const handler = captureMiddleware(nanoBananaPlugin('test-only', async (_url, options) => {
    calls++;
    res.emit('close');
    assert.equal(options?.signal?.aborted, true);
    throw new DOMException('Cancelled', 'AbortError');
  }), 'configureServer');
  let calls = 0;
  const req = Object.assign(Readable.from([JSON.stringify(input)]), { url: '/api/nano-banana', method: 'POST', headers: { host: 'localhost', 'content-type': 'application/json' }, socket: {} });
  const res = Object.assign(new EventEmitter(), { destroyed: true, writableEnded: false });
  const logger = mock.method(console, 'error', () => {});
  try { await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => assert.fail()); }
  finally { logger.mock.restore(); }
  assert.equal(calls, 1);
});
