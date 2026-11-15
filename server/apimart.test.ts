import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApimartRequest, apimartPlugin } from './apimart.ts';
import { captureMiddleware } from './testMiddleware.ts';
import { checkApiConnection } from './apiSettings.ts';
import { defaultSunburstSettings, imageQualities, apimartAspectRatios, sunburstResolutions } from '../src/nodes/sunburst.ts';

const png = 'data:image/png;base64,aGVsbG8=';
const input = { ...defaultSunburstSettings, provider: 'apimart', prompt: 'Edit the product', images: [] };
async function invoke(body: unknown, upstream: typeof fetch, options: { path?: string; key?: string; headers?: Record<string, string | undefined>; hook?: 'configureServer' | 'configurePreviewServer'; method?: string } = {}) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: options.path ?? '/api/apimart/images', method: options.method ?? 'POST',
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

test('APIMart uses only the documented Ext parameters for both versions and every ratio/resolution/quality', () => {
  for (const variant of ['Sunburst', 'Flare']) for (const size of apimartAspectRatios) for (const resolution of sunburstResolutions) for (const quality of imageQualities) {
    const request = buildApimartRequest({ ...input, variant, size, resolution, quality, background: 'transparent', moderation: 'low', seed: 5 });
    assert.deepEqual(request.body, { model: 'gpt-image-2.6-ext', version: variant.toLowerCase(), prompt: input.prompt, size, resolution: resolution.toLowerCase(), quality, output_format: 'png', n: 1, nsfw_check: false });
  }
  assert.equal(buildApimartRequest({ ...input, complexity: 'high' }).body.complexity, 'high');
});

const standardInput = { ...input, channelModel: 'gpt-image-2.6' };
test('APIMart standard routes both variants and sends exact static editing parameters', async () => {
  for (const variant of ['Sunburst', 'Flare']) {
    const requests: Record<string, unknown>[] = [];
    const result = await invoke({ ...standardInput, variant, images: [png], mask: png, size: '1600x1200', background: 'transparent', moderation: 'auto', complexity: 'low' }, async (url, init) => {
      if (String(url).includes('/uploads/images')) return Response.json({ url: 'https://cdn.example/reference.png' });
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ data: [{ task_id: 'task_standard' }] });
    });
    assert.equal(result.status, 200);
    assert.deepEqual(requests, [{ model: `gpt-image-2.6-${variant.toLowerCase()}`, prompt: input.prompt, size: '1600x1200', quality: 'medium', output_format: 'png', n: 1, nsfw_check: false,
      background: 'transparent', moderation: 'auto', complexity: 'low', mask_url: png, image_urls: ['https://cdn.example/reference.png'] }]);
  }
  const ratio = buildApimartRequest({ ...standardInput, size: '9:21', resolution: '4K' }).body;
  assert.equal(ratio.size, '9:21'); assert.equal(ratio.resolution, '4k');
});

test('APIMart standard GIF forwards 2–16 frames and references without SVG or compression fields', () => {
  for (const frameCount of [2, 9, 16]) {
    assert.deepEqual(buildApimartRequest({ ...standardInput, outputFormat: 'gif', images: [png], size: '512x512', frameCount, svgModel: 'gpt-6.1-sol', svgEffort: 'max' }).body,
      { model: 'gpt-image-2.6-sunburst', prompt: input.prompt, size: '512x512', quality: 'medium', output_format: 'gif', n: 1, nsfw_check: false, background: 'auto', moderation: 'low', frame_count: frameCount });
  }
  assert.equal(buildApimartRequest({ ...standardInput, outputFormat: 'gif' }).body.frame_count, 9);
});

test('APIMart standard SVG always sends the author model and only its supported effort', () => {
  for (const svgModel of ['gpt-6-luna', 'gpt-6.1-sol']) for (const svgEffort of ['auto', 'low', 'medium', 'high', 'xhigh', 'max', ...(svgModel === 'gpt-6-luna' ? ['none'] : [])]) {
    assert.deepEqual(buildApimartRequest({ ...standardInput, outputFormat: 'svg', images: [png], svgModel, svgEffort, frameCount: 16 }).body,
      { model: 'gpt-image-2.6-sunburst', prompt: input.prompt, size: 'auto', resolution: '1k', quality: 'medium', output_format: 'svg', n: 1, nsfw_check: false, background: 'auto', moderation: 'low',
        svg: { model: svgModel, ...(svgEffort === 'auto' ? {} : { reasoning: { effort: svgEffort } }) } });
  }
  assert.deepEqual(buildApimartRequest({ ...standardInput, outputFormat: 'svg' }).body.svg, { model: 'gpt-6-luna' });
  assert.equal('svg' in buildApimartRequest({ ...standardInput, svgModel: 'gpt-6.1-sol', svgEffort: 'high' }).body, false);
});

test('APIMart standard rejects incompatible parameters before any upload or paid task', async () => {
  for (const patch of [
    { channelModel: 'unknown' }, { size: '1000x1000' }, { size: '4096x2048' }, { moderation: 'high' },
    { mask: png }, { images: [png], mask: 'data:image/jpeg;base64,aGVsbG8=' },
    { outputFormat: 'jpeg', background: 'transparent' }, { outputFormat: 'gif', background: 'transparent' },
    ...[1, 17, 2.5, '2.5', null].map(frameCount => ({ outputFormat: 'gif', frameCount })),
    ...['1:1', '1024x1024', '768x768'].map(size => ({ outputFormat: 'gif', frameCount: 16, size })),
    ...['gif', 'svg'].map(outputFormat => ({ outputFormat, images: [png], mask: png })),
    { outputFormat: 'svg', svgModel: 'gpt-6.1-sol', svgEffort: 'none' },
    { outputFormat: 'svg', svgModel: 'gpt-6-luna', svgEffort: 'minimal' },
    { outputFormat: 'svg', svgModel: 'unknown' },
  ]) {
    const result = await invoke({ ...standardInput, ...patch }, async () => assert.fail(`Must not submit ${JSON.stringify(patch)}`));
    assert.equal(result.status, 400, JSON.stringify(patch));
  }
});

test('APIMart SVG polling preserves validated vector bytes and rejects raster or unsafe results', async () => {
  const xml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><path d="M0 0h10v10z"/></svg>';
  for (const [mime, output, success] of [
    ['image/svg+xml; charset=utf-8', xml, true],
    ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/a.png"/></svg>', false],
    ['image/png', 'raster', false],
  ] as const) {
    const result = await invoke({ taskId: 'task_svg', outputFormat: 'svg' }, async url => String(url).includes('/tasks/')
      ? Response.json({ data: { status: 'completed', result: { images: [{ url: ['https://cdn.example/result.svg'] }] } } })
      : new Response(output, { headers: { 'content-type': mime } }), { path: '/api/apimart/task' });
    assert.equal(result.status, success ? 200 : 502);
    if (success) {
      assert.equal(result.body.format, 'svg');
      assert.equal(result.body.image, `data:image/svg+xml;base64,${Buffer.from(xml).toString('base64')}`);
    }
  }
});

test('unsupported APIMart settings fail before uploads or task creation', async () => {
  const noFetch: typeof fetch = async () => assert.fail('Must not call provider');
  for (const bad of [null, {}, { ...input, size: '1024x1024' }, { ...input, size: '2:1' }, { ...input, resolution: '8K' }, { ...input, complexity: 'max' },
    { ...input, width: 1024 }, { ...input, markup: png }, { ...input, images: [png], mask: png }, { ...input, outputFormat: 'svg' },
    { ...input, outputFormat: 'gif', size: '1:1' }, { ...input, outputFormat: 'gif', images: [png] },
    { ...input, images: ['data:image/gif;base64,aGVsbG8='], resolution: '2K' }, { ...input, images: Array(17).fill(png) }]) {
    assert.equal((await invoke(bad, noFetch)).status, 400);
  }
  assert.throws(() => buildApimartRequest({ ...input, images: [`data:image/png;base64,${Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64')}`] }), /20 MiB/);
  assert.equal((await invoke(input, noFetch, { key: '' })).status, 503);
});

for (const hook of ['configureServer', 'configurePreviewServer'] as const) test(`${hook}: editing uploads ordered files then submits URLs to generations with the selected key and base`, async () => {
  const calls: string[] = [];
  const result = await invoke({ ...input, variant: 'Flare', images: [png, 'data:image/jpeg;base64,d29ybGQ='], size: '16:9', resolution: '4K', quality: 'max' }, async (url, init) => {
    calls.push(String(url));
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer custom-apimart-key');
    assert.equal(init?.redirect, 'error');
    if (String(url).includes('/uploads/images')) {
      assert.equal(url, 'https://gateway.example/v1/uploads/images?retention_days=3');
      assert.ok(init?.body instanceof FormData);
      assert.deepEqual([...init.body.keys()], ['file']);
      assert.equal(new Headers(init.headers).has('content-type'), false);
      const file = init.body.get('file') as File;
      assert.equal(file.name, `reference-${calls.length}.${calls.length === 1 ? 'png' : 'jpeg'}`);
      assert.equal(file.type, calls.length === 1 ? 'image/png' : 'image/jpeg');
      assert.equal(await file.text(), calls.length === 1 ? 'hello' : 'world');
      return Response.json({ url: `https://cdn.example/reference-${calls.length}` });
    }
    assert.equal(url, 'https://gateway.example/v1/images/generations');
    assert.deepEqual(JSON.parse(String(init?.body)), { model: 'gpt-image-2.6-ext', version: 'flare', prompt: input.prompt, size: '16:9', resolution: '4k', quality: 'max', output_format: 'png', n: 1, nsfw_check: false,
      image_urls: ['https://cdn.example/reference-1', 'https://cdn.example/reference-2'] });
    return Response.json({ code: 200, data: [{ task_id: 'task_test', status: 'submitted' }] });
  }, { hook, headers: { 'x-momoflow-provider': 'apimart', 'x-momoflow-api-key': 'custom-apimart-key', 'x-momoflow-base-url': 'https://gateway.example/v1' } });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { taskId: 'task_test' }); assert.equal(calls.length, 3);
});

test('APIMart polling accepts wrapped and unwrapped tasks and downloads original bytes without credentials', async () => {
  for (const wrapped of [true, false]) for (const outputFormat of ['png', 'jpeg', 'webp', 'gif']) {
    let calls = 0;
    const result = await invoke({ taskId: 'task_test', outputFormat }, async (url, init) => {
      calls++;
      if (calls === 1) {
        assert.equal(url, 'https://api.apimart.ai/v1/tasks/task_test?language=zh');
        assert.equal(init?.method, 'GET');
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer apimart-test-secret');
        const task = { status: 'completed', result: { images: [{ url: ['https://cdn.example/result'] }] } };
        return Response.json(wrapped ? { code: 200, data: task } : task);
      }
      assert.equal(url, 'https://cdn.example/result');
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      return new Response('original-image-bytes', { headers: { 'content-type': `image/${outputFormat}` } });
    }, { path: '/api/apimart/task' });
    assert.equal(result.status, 200); assert.equal(calls, 2);
    assert.equal(result.body.format, outputFormat);
    assert.equal(result.body.image, `data:image/${outputFormat};base64,${Buffer.from('original-image-bytes').toString('base64')}`);
  }
});

test('APIMart failures stop immediately, preserve task IDs and redact secrets', async () => {
  let calls = 0;
  const uploadFailure = await invoke({ ...input, images: [png, png] }, async () => {
    calls++;
    return Response.json({ error: { message: 'Quota for apimart-test-secret exhausted', code: 'insufficient_user_quota' } }, { status: 402 });
  });
  assert.equal(calls, 1); assert.equal(uploadFailure.status, 502);
  assert.equal(JSON.stringify(uploadFailure).includes('apimart-test-secret'), false);
  assert.match(uploadFailure.body.error, /Quota/);
  for (const status of ['pending', 'processing', 'failed']) {
    const result = await invoke({ taskId: 'task_test', outputFormat: 'png' }, async () => Response.json({ data: { status, error: { message: 'upstream policy: apimart-test-secret' } } }), { path: '/api/apimart/task' });
    assert.equal(result.status, status === 'failed' ? 502 : 200);
    assert.equal(result.body.taskId, 'task_test');
    assert.equal(JSON.stringify(result).includes('apimart-test-secret'), false);
  }
  const timeout = await invoke({ taskId: 'task_test', outputFormat: 'png' }, async () => new Response('', { status: 504 }), { path: '/api/apimart/task' });
  assert.equal(timeout.body.code, 'MODEL_TIMEOUT'); assert.equal(timeout.body.taskId, 'task_test');
  for (const body of [{ taskId: '../secret', outputFormat: 'png' }, { taskId: 'task_test', outputFormat: 'bmp' }]) assert.equal((await invoke(body, async () => assert.fail('Invalid poll'), { path: '/api/apimart/task' })).status, 400);
});

test('APIMart rejects untrusted clients and malformed successes without resubmitting', async () => {
  for (const headers of [{ host: 'evil.example' }, { origin: 'https://evil.example' }, { 'content-type': 'text/plain' }]) {
    assert.ok([403, 415].includes((await invoke(input, async () => assert.fail('Must not fetch'), { headers })).status));
  }
  let calls = 0;
  const malformed = await invoke(input, async () => { calls++; return Response.json({ data: [] }); });
  assert.equal(malformed.status, 502); assert.equal(calls, 1);
});

test('APIMart connection testing reads authenticated token balance without generating', async () => {
  await checkApiConnection('apimart', 'https://api.apimart.ai/v1', 'test-key', new AbortController().signal, async (url, init) => {
    assert.equal(url, 'https://api.apimart.ai/v1/balance'); assert.equal(init?.method, 'GET');
    return Response.json({ success: true, remain_balance: 0, unlimited_quota: false });
  });
  for (const body of [{ object: 'list', data: [] }, { success: false }, { success: true, remain_balance: 'unknown' }]) {
    await assert.rejects(checkApiConnection('apimart', 'https://api.apimart.ai/v1', 'test-key', new AbortController().signal, async () => Response.json(body)));
  }
});

for (const hook of ['configureServer', 'configurePreviewServer'] as const) test(`${hook}: task management always requests Chinese errors and recognizes remote cancellation`, async () => {
  for (const status of ['pending', 'processing', 'cancelled', 'failed']) {
    let calls = 0;
    const result = await invoke({ taskId: 'task_test', outputFormat: 'png', language: 'en' }, async (url, init) => {
      calls++;
      assert.equal(url, 'https://gateway.example/v1/tasks/task_test?language=zh');
      assert.equal(init?.method, 'GET');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer custom-apimart-key');
      return Response.json({ code: 200, data: { id: 'task_test', status, error: { message: '参考图片无法下载，请检查图片链接。' } } });
    }, { path: '/api/apimart/task', hook, headers: { 'x-momoflow-provider': 'apimart', 'x-momoflow-api-key': 'custom-apimart-key', 'x-momoflow-base-url': 'https://gateway.example/v1' } });
    assert.equal(calls, 1);
    assert.equal(result.status, status === 'failed' ? 502 : 200);
    assert.equal(result.body.taskId, 'task_test');
    if (status === 'failed') assert.match(result.body.error, /参考图片无法下载，请检查图片链接。/);
    else assert.equal(result.body.status, status);
  }
});
