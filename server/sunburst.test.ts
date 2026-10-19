import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { buildSunburstPayload, buildSunburstRequest, sunburstPlugin } from './sunburst.ts';
import { defaultSunburstSettings, sunburstModel } from '../src/nodes/sunburst.ts';
const png = 'data:image/png;base64,aGVsbG8=';
const input = { ...defaultSunburstSettings, prompt: 'A green circle', images: [] };

test('generation and edit normalization use the exact model, endpoint and images/mask schema', () => {
  const generation = buildSunburstRequest(input);
  assert.equal(generation.endpoint, 'generations'); assert.equal(generation.body.model, sunburstModel);
  assert.equal(generation.body.n, 1); assert.equal('images' in generation.body, false);
  const edit = buildSunburstRequest({ ...input, images: [png, png], mask: png, quality: 'high', size: '1536x1024', outputFormat: 'webp' });
  assert.equal(edit.endpoint, 'edits'); assert.deepEqual(edit.body.images, [{ image_url: png }, { image_url: png }]);
  assert.deepEqual(edit.body.mask, { image_url: png }); assert.equal(edit.body.output_format, 'webp');
  assert.equal(edit.body.size, '1536x1024'); assert.equal(edit.body.quality, 'high');
});
test('invalid settings and source data never reach the provider', () => {
  for (const bad of [null, {}, { ...input, prompt: '' }, { ...input, prompt: 'a'.repeat(32001) }, { ...input, quality: 'max' },
    { ...input, background: 'transparent', outputFormat: 'jpeg' }, { ...input, size: 'unverified' },
    { ...input, images: ['http://localhost/private'] }, { ...input, images: Array(17).fill(png) },
    { ...input, mask: png }, { ...input, images: [png], mask: 'data:image/jpeg;base64,aGVsbG8=' }]) assert.throws(() => buildSunburstRequest(bad));
});
async function invoke({ hook = 'configureServer', headers = {}, body = input, key = 'test-only', provider = async () => new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] })), method = 'POST' }: {
  hook?: 'configureServer' | 'configurePreviewServer'; headers?: Record<string, string>; body?: unknown; key?: string; provider?: typeof fetch; method?: string;
} = {}) {
  let handler;
  const plugin = sunburstPlugin(key, provider);
  plugin[hook]({ middlewares: { use(value) { handler = value; } } });
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url: '/api/sunburst', method, headers: { host: 'localhost:5173', 'content-type': 'application/json', ...headers }, socket: {} });
  let status = 0; let text = '';
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, writeHead(code: number) { status = code; }, end(value: string) { text = value; this.writableEnded = true; } });
  await handler(req, res, () => assert.fail('unexpected next'));
  return { status, body: JSON.parse(text) };
}
for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  test(`${hook}: credentials stay on server; only intended generation/edit endpoint receives payload`, async () => {
    for (const images of [[], [png]]) {
      let calls = 0;
      const result = await invoke({ hook, body: { ...input, images }, provider: async (url, options) => {
        calls++; assert.equal(url, `https://zenmux.ai/api/v1/images/${images.length ? 'edits' : 'generations'}`);
        assert.equal(options.headers.Authorization, 'Bearer test-only');
        if (images.length) {
          assert.ok(options.body instanceof FormData);
          assert.equal(options.body.get('model'), sunburstModel);
          assert.equal(options.body.getAll('image[]').length, images.length);
          assert.equal(new Headers(options.headers).has('content-type'), false);
        } else {
          assert.equal(JSON.parse(options.body).model, sunburstModel);
          assert.equal(new Headers(options.headers).get('content-type'), 'application/json');
        }
        return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }], output_format: 'webp' }));
      } });
      assert.equal(calls, 1); assert.equal(result.status, 200); assert.equal(result.body.image, 'data:image/webp;base64,aGVsbG8=');
      assert.equal(JSON.stringify(result).includes('test-only'), false);
    }
  });
  test(`${hook}: rejects cross-origin, rebinding, malformed hosts and missing keys before fetch`, async () => {
    const provider = async () => { assert.fail('must not submit'); };
    for (const headers of [{ origin: 'https://evil.example' }, { host: 'evil.example' }, { host: 'localhost.evil.example' }, { host: 'localhost:65536' }, { origin: 'null' }, { origin: 'http://localhost:5174' }]) assert.equal((await invoke({ hook, headers, provider })).status, 403);
    assert.equal((await invoke({ hook, key: '', provider })).status, 503);
    assert.equal((await invoke({ hook, method: 'GET', provider })).status, 405);
    assert.equal((await invoke({ hook, body: {}, provider })).status, 400);
  });
}
test('provider errors, malformed successes and transport errors do not retry or expose credentials', async () => {
  for (const response of [() => new Response('Bearer test-only', { status: 401 }), () => new Response('{"data":[]}'), () => new Response('bad json')]) {
    let calls = 0;
    const result = await invoke({ provider: async () => { calls++; return response(); } });
    assert.equal(result.status, 502); assert.equal(calls, 1); assert.equal(JSON.stringify(result).includes('test-only'), false);
  }
  let calls = 0;
  assert.equal((await invoke({ provider: async () => { calls++; throw new Error('secret upstream'); } })).status, 502);
  assert.equal(calls, 1);
});

test('multipart edits preserve ordered image bytes, MIME types, mask and all selected settings', async () => {
  const jpeg = 'data:image/jpeg;base64,d29ybGQ=';
  const payload = buildSunburstPayload(buildSunburstRequest({ ...input, images: [png, jpeg], mask: png, size: '864x1536', quality: 'high', outputFormat: 'webp' }));
  assert.ok(payload.body instanceof FormData);
  assert.equal(new Headers(payload.headers).has('content-type'), false);
  const uploads = payload.body.getAll('image[]') as File[];
  assert.deepEqual(uploads.map(file => [file.name, file.type]), [['image-1.png', 'image/png'], ['image-2.jpeg', 'image/jpeg']]);
  assert.deepEqual(await Promise.all(uploads.map(file => file.text())), ['hello', 'world']);
  const mask = payload.body.get('mask') as File;
  assert.equal(mask.type, 'image/png'); assert.equal(await mask.text(), 'hello');
  for (const [name, value] of Object.entries({ model: sunburstModel, prompt: input.prompt, n: '1', quality: 'high', background: 'auto', size: '864x1536', output_format: 'webp' })) assert.equal(payload.body.get(name), value);
  assert.equal(payload.body.has('images'), false);
  const wire = new Request('https://example.invalid/images/edits', { method: 'POST', body: payload.body });
  assert.match(wire.headers.get('content-type') ?? '', /^multipart\/form-data; boundary=/);
  assert.equal((await wire.formData()).getAll('image[]').length, 2);
  const withoutMask = buildSunburstPayload(buildSunburstRequest({ ...input, images: [jpeg] }));
  assert.ok(withoutMask.body instanceof FormData);
  assert.equal(withoutMask.body.has('mask'), false);
});

test('failed edits retain provider status, concrete error and header request ID without retrying', async () => {
  let calls = 0;
  const result = await invoke({ body: { ...input, images: [png, png] }, provider: async (url) => {
    calls++; assert.equal(url, 'https://zenmux.ai/api/v1/images/edits');
    return Response.json({ error: { type: 'provider_api_error', code: 'invalid_size', message: 'Unsupported size for image editing' }, request_id: 'body-id' }, {
      status: 500, headers: { 'X-ZenMux-RequestId': 'request-edit-123', 'X-Request-ID': 'secondary-id' },
    });
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, 502);
  assert.deepEqual(result.body.diagnostic, { status: 500, requestId: 'request-edit-123', type: 'provider_api_error', code: 'invalid_size', message: 'Unsupported size for image editing' });
  for (const text of ['provider_api_error', 'invalid_size', 'Unsupported size for image editing', 'Request ID：request-edit-123', 'ZenMux HTTP：500']) assert.ok(result.body.error.includes(text));
});

test('diagnostics redact keys and image payloads and ignore unrelated response fields', async () => {
  const key = 'configured-private-token';
  const result = await invoke({ key, provider: async () => Response.json({
    error: { type: 'provider_error', code: 500, message: `Failed ${key} Bearer another-token sk-ai-secret ${png}` },
    images: [png], authorization: key, debug: 'private-debug-context',
  }, { status: 500 }) });
  const serialized = JSON.stringify(result.body);
  for (const secret of [key, 'another-token', 'sk-ai-secret', png, 'private-debug-context']) assert.equal(serialized.includes(secret), false);
  assert.equal(result.body.diagnostic.code, '500');
  assert.ok(result.body.error.includes('[redacted]'));
});

test('request ID survives plain text, HTML, oversized errors, invalid JSON and malformed success', async () => {
  for (const [body, status] of [['Upstream unavailable', 500], ['<html>private gateway page</html>', 502], ['x'.repeat(70 * 1024), 500], ['{bad json', 500], ['{bad json', 200], ['{"data":[]}', 200]] as const) {
    const result = await invoke({ provider: async () => new Response(body, { status, headers: { 'x-request-id': 'fallback-id' } }) });
    assert.equal(result.status, 502);
    assert.equal(result.body.diagnostic.requestId, 'fallback-id');
    assert.equal(result.body.diagnostic.status, status);
    assert.ok(result.body.error.includes('Request ID：fallback-id'));
    assert.ok(result.body.error.length < 3000);
    assert.equal(result.body.error.includes('private gateway page'), false);
    if (body === 'Upstream unavailable') assert.equal(result.body.diagnostic.message, body);
  }
  const result = await invoke({ provider: async () => Response.json({ requestId: 'body-fallback', error: { message: 'Image rejected' } }, { status: 400 }) });
  assert.equal(result.body.diagnostic.requestId, 'body-fallback');
});

test('new aspect ratios and custom sizes are forwarded unchanged for generation and editing', () => {
  for (const size of ['1536x864', '864x1536', '1536x1152', '3840x2160', '2160x3840']) {
    for (const images of [[], [png]]) assert.equal(buildSunburstRequest({ ...input, size, images }).body.size, size);
  }
  for (const size of ['1025x1024', '4096x2048', '512x512', '3072x3072', '2048x512']) assert.throws(() => buildSunburstRequest({ ...input, size }));
});
