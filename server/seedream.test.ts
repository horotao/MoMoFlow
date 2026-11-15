import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { apimartPlugin } from './apimart.ts';
import { captureMiddleware } from './testMiddleware.ts';
import { buildSeedreamRequest } from './seedream.ts';
import { defaultSeedreamSettings, seedreamAspectRatios, seedreamModel } from '../src/nodes/seedream.ts';

const png = 'data:image/png;base64,aGVsbG8=';
const input = { ...defaultSeedreamSettings, prompt: 'Edit the product', images: [] };
async function invoke(body: unknown, upstream: typeof fetch, options: { path?: string; key?: string; headers?: Record<string, string | undefined>; hook?: 'configureServer' | 'configurePreviewServer'; method?: string } = {}) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: options.path ?? '/api/apimart/seedream', method: options.method ?? 'POST',
    headers: { host: 'localhost:5173', 'content-type': 'application/json', ...options.headers }, socket: {},
  });
  let status = 0; let result = '';
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    writeHead(code: number) { status = code; }, end(value: string) { result = value; this.writableEnded = true; },
  });
  await captureMiddleware(apimartPlugin(options.key ?? 'apimart-test-secret', upstream), options.hook ?? 'configureServer')(
    req as unknown as IncomingMessage, res as unknown as ServerResponse, () => assert.fail('Unexpected next'),
  );
  return { status, body: JSON.parse(result) };
}

test('Seedream sends the exact documented payload, with tier-only size and explicit booleans', () => {
  assert.equal(seedreamModel, 'seedream-5-5');
  assert.deepEqual(buildSeedreamRequest(input), { images: [], body: {
    model: seedreamModel, prompt: input.prompt, size: '1.5K', background: 'auto', nsfw_check: false, output_format: 'png', watermark: false, n: 1,
  } });
  for (const resolution of ['1.5K', '2K']) for (const outputFormat of ['jpeg', 'png']) for (const enabled of [true, false]) {
    const result = buildSeedreamRequest({ ...input, resolution, outputFormat, nsfwCheck: enabled, watermark: enabled, images: [png] });
    assert.deepEqual(result.body, { model: seedreamModel, prompt: input.prompt, size: resolution, background: 'auto', output_format: outputFormat, nsfw_check: enabled, watermark: enabled, n: 1, image_urls: [png] });
  }
});

test('Seedream ratio requests pair size with the selected resolution; exact pixels omit resolution entirely', async () => {
  for (const size of seedreamAspectRatios) for (const resolution of ['1.5K', '2K']) {
    const result = await invoke({ ...input, size, resolution }, async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: 'seedream-5-5', prompt: input.prompt, size, resolution,
        background: 'auto', nsfw_check: false, output_format: 'png', watermark: false, n: 1,
      });
      return Response.json({ data: [{ task_id: 'task_ratio' }] });
    });
    assert.equal(result.status, 200);
  }
  for (const size of ['1537x1001', '5377x860', '3840x240', '240x3840']) for (const resolution of [undefined, '1.5K', '2K']) {
    const result = buildSeedreamRequest({ ...input, size, resolution });
    assert.equal(result.body.size, size); assert.equal('resolution' in result.body, false);
  }
});

test('Seedream 5.5 allows transparent text-to-image and image-to-image only with PNG', () => {
  for (const images of [[], [png]]) {
    const result = buildSeedreamRequest({ ...input, background: 'transparent', outputFormat: 'png', images });
    assert.equal(result.body.background, 'transparent');
    assert.equal(result.body.output_format, 'png');
    assert.equal(result.body.model, 'seedream-5-5');
    assert.equal('layer_decomposition' in result.body, false);
    assert.equal('resolution' in result.body, false);
  }
  assert.throws(() => buildSeedreamRequest({ ...input, background: 'transparent', outputFormat: 'jpeg' }), /PNG/);
});

test('Seedream validates unsupported and malformed requests before any upstream side effect', async () => {
  for (const patch of [
    { resolution: '1K' }, { resolution: '4K' }, { resolution: '16:9' }, { outputFormat: 'webp' }, { background: 'invalid' }, { background: 'transparent', outputFormat: 'jpeg' }, { nsfwCheck: 'off' }, { watermark: 0 },
    { layer_decomposition: true }, { layerDecomposition: true }, { layer_decomposition_options: { max_images: 3 } }, { mask: png }, { size: '512x512' }, { size: '16:10' }, { size: '5377x861' }, { size: '4000x240' }, { size: '1536.5x1000' }, { n: 2 }, { prompt: '' },
    { images: Array(11).fill(png) }, { images: ['http://localhost/private'] }, { images: ['data:image/svg+xml;base64,aGVsbG8='] },
    { images: [`data:image/png;base64,${Buffer.alloc(30 * 1024 * 1024 + 1).toString('base64')}`] },
  ]) {
    const result = await invoke({ ...input, ...patch }, async () => assert.fail('Invalid request must not submit'));
    assert.equal(result.status, 400);
  }
  assert.throws(() => buildSeedreamRequest({ ...input, images: Array(2).fill(`data:image/png;base64,${Buffer.alloc(24 * 1024 * 1024).toString('base64')}`) }), /总大小/);
});

test('Seedream uses APIMart credentials in dev and preview, sends ordered Data URIs without extra uploads', async () => {
  for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
    let calls = 0;
    const result = await invoke({ ...input, images: [png, png.replace('png', 'jpeg')] }, async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://gateway.example/v1/images/generations');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer custom-key');
      assert.deepEqual(JSON.parse(String(init?.body)).image_urls, [png, png.replace('png', 'jpeg')]);
      return Response.json({ data: [{ status: 'submitted', task_id: 'task_seedream' }] });
    }, { hook, headers: { 'x-momoflow-provider': 'apimart', 'x-momoflow-api-key': 'custom-key', 'x-momoflow-base-url': 'https://gateway.example/v1' } });
    assert.equal(result.status, 200); assert.deepEqual(result.body, { taskId: 'task_seedream' }); assert.equal(calls, 1);
  }
});

test('Seedream submission errors and missing credentials never trigger a resubmission', async () => {
  let calls = 0;
  const result = await invoke(input, async () => {
    calls++; return Response.json({ error: { message: 'Quota apimart-test-secret exhausted' } }, { status: 402 });
  });
  assert.equal(result.status, 502); assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes('apimart-test-secret'), false);
  assert.equal((await invoke(input, async () => assert.fail('No key'), { key: '' })).status, 503);
  assert.equal((await invoke(input, async () => assert.fail('Untrusted'), { headers: { origin: 'https://evil.example' } })).status, 403);
});

test('Seedream results use the shared task query and download original bytes without credentials', async () => {
  const result = await invoke({ taskId: 'task_seedream', outputFormat: 'jpeg' }, async (url, init) => {
    if (String(url).includes('/tasks/')) {
      assert.equal(String(url), 'https://api.apimart.ai/v1/tasks/task_seedream?language=zh');
      return Response.json({ data: { status: 'completed', result: { images: [{ url: ['https://cdn.example/seedream.jpeg'] }] } } });
    }
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'content-type': 'image/jpeg' } });
  }, { path: '/api/apimart/task' });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { image: 'data:image/jpeg;base64,/9j/2Q==', format: 'jpeg' });
});
