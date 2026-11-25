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
  assert.equal(buildApimartRequest({ ...input, complexity: 'high' }).body.complexity, undefined);
});

const standardInput = { ...input, channelModel: 'gpt-image-2.6' };

test('Grok submits the documented text and reference parameters and reads the versioned task ID', async () => {
  const path = '/api/apimart/grok';
  for (const images of [[], ['https://cdn.example/a.png', 'https://cdn.example/b.png']]) {
    const result = await invoke({ size: '2:3', prompt: '  paint  ', images }, async (url, init) => {
      assert.equal(url, 'https://api.apimart.ai/v1/images/generations');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('X-APIMart-Response-Version'), '2026-07-27');
      assert.ok(headers.get('Idempotency-Key'));
      assert.deepEqual(JSON.parse(String(init?.body)), { model: 'grok-imagine-2.0-ext', size: '2:3', prompt: 'paint',
        n: 1, response_format: 'url', ...(images.length ? { image_urls: images } : { resolution: 'quality' }) });
      return Response.json({ code: 202, data: { id: 'task_grok', status: 'pending' } }, { status: 202 });
    }, { path });
    assert.deepEqual(result, { status: 200, body: { taskId: 'task_grok' } });
  }
  for (const invalid of [{ size: 'auto' }, { images: Array(6).fill('https://cdn.example/a.png') }, { prompt: ' ' }]) {
    const result = await invoke({ prompt: 'paint', size: '1:1', images: [], ...invalid }, async () => assert.fail(), { path });
    assert.equal(result.status, 400);
  }
});

test('Kling submits normal and series counts using the documented APIMart fields', async () => {
  const path = '/api/apimart/kling';
  const reference = 'https://cdn.example/reference.png';
  const input = { prompt: 'Use @Image1', size: '21:9', resolution: '8K', outputFormat: 'png', images: [reference] };
  for (const [mode, count, fields] of [
    ['standard', 9, { n: 9 }],
    ['series', 4, { sequential_image_generation: 'auto', sequential_image_generation_options: { max_images: 4 } }],
  ] as const) {
    const result = await invoke({ ...input, mode, count }, async (url, init) => {
      assert.equal(url, 'https://api.apimart.ai/v1/images/generations');
      assert.deepEqual(JSON.parse(String(init?.body)), { model: 'kling-v4-image', prompt: input.prompt,
        size: input.size, resolution: input.resolution, image_urls: [reference], ...fields });
      return Response.json({ code: 200, data: [{ task_id: 'task_kling' }] });
    }, { path });
    assert.deepEqual(result, { status: 200, body: { taskId: 'task_kling' } });
  }
  for (const bad of [{ count: 10 }, { count: '3' }, { mode: 'series', count: 1 }, { mode: 'series', count: 5 },
    { resolution: '1K' }, { size: '2048x2048' }, { outputFormat: 'jpeg' }, { images: Array(11).fill(reference) }, { prompt: '图'.repeat(21001) }]) {
    const result = await invoke({ ...input, count: 2, mode: 'standard', ...bad }, async () => assert.fail('Must not call APIMart'), { path });
    assert.equal(result.status, 400);
  }
});

test('APIMart polling returns every Kling output in provider order when requested', async () => {
  const urls = ['https://cdn.example/kling-1.png', 'https://cdn.example/kling-2.png', 'https://cdn.example/kling-3.png'];
  const result = await invoke({ taskId: 'task_kling', outputFormat: 'png', allImages: true }, async () => Response.json({
    data: { status: 'completed', result: { images: [{ url: urls.slice(0, 2) }, { url: urls.slice(2) }] } },
  }), { path: '/api/apimart/task' });
  assert.deepEqual(result, { status: 200, body: { status: 'completed', taskId: 'task_kling', imageUrls: urls, format: 'png' } });
});

test('APIMart standard submits the uploaded overlay as markup_url, including local-key uploads', async () => {
  const imageUrl = 'https://cdn.example/original.png';
  const overlayUrl = 'https://cdn.example/overlay.png';
  const pngOverlay = 'data:image/png;base64,bWFya3Vw';
  for (const direct of [true, false]) {
    const uploads: string[] = [];
    const result = await invoke({ ...standardInput, images: [direct ? imageUrl : png], markup: direct ? overlayUrl : pngOverlay }, async (url, init) => {
      if (String(url).endsWith('/uploads/images?retention_days=3')) {
        const file = (init?.body as FormData).get('file');
        assert.ok(file instanceof File);
        assert.equal(file.type, 'image/png');
        uploads.push(await file.text());
        return Response.json({ url: file.name === 'markup.png' ? overlayUrl : imageUrl });
      }
      assert.equal(url, 'https://api.apimart.ai/v1/images/generations');
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.image_urls, [imageUrl]);
      assert.equal(body.markup_url, overlayUrl);
      assert.ok(!('markup' in body) && !('mask_url' in body));
      return Response.json({ data: [{ task_id: 'task_markup' }] });
    });
    assert.equal(result.status, 200);
    assert.deepEqual(uploads, direct ? [] : ['hello', 'markup']);
  }
  for (const options of [
    { images: [], markup: overlayUrl },
    { images: [imageUrl], markup: overlayUrl, mask: imageUrl },
    { images: [imageUrl], markup: overlayUrl, outputFormat: 'svg' },
    { images: [imageUrl], markup: overlayUrl, channelModel: 'gpt-image-2.6-ext' },
  ]) assert.equal((await invoke({ ...standardInput, ...options }, async () => assert.fail('Invalid markup must fail before upload'))).status, 400);
});

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
      background: 'transparent', moderation: 'low', mask_url: png, image_urls: ['https://cdn.example/reference.png'] }]);
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
    { channelModel: 'unknown' }, { size: '1000x1000' }, { size: '4096x2048' },
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

test('unsupported APIMart settings fail before uploads or task creation', async () => {
  const noFetch: typeof fetch = async () => assert.fail('Must not call provider');
  for (const bad of [null, {}, { ...input, size: '1024x1024' }, { ...input, size: '2:1' }, { ...input, resolution: '8K' },
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

test('APIMart polling returns compact URLs and expiry without downloading any result bytes', async () => {
  for (const wrapped of [true, false]) for (const outputFormat of ['png', 'jpeg', 'webp', 'gif', 'svg']) {
    let calls = 0;
    const result = await invoke({ taskId: 'task_test', outputFormat }, async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.apimart.ai/v1/tasks/task_test?language=zh');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer apimart-test-secret');
      const task = { status: 'completed', result: { images: [{ url: wrapped ? ['https://cdn.example/result'] : 'https://cdn.example/result', expires_at: 1900000000 }] } };
      return Response.json(wrapped ? { code: 200, data: task } : task);
    }, { path: '/api/apimart/task' });
    assert.equal(result.status, 200); assert.equal(calls, 1);
    assert.deepEqual(result.body, { status: 'completed', taskId: 'task_test', imageUrl: 'https://cdn.example/result', format: outputFormat, expiresAt: 1900000000 });
    assert.ok(JSON.stringify(result.body).length < 300);
  }
});

test('APIMart rejects missing, credentialed and local result URLs without fetching them', async () => {
  for (const url of [undefined, 'http://cdn.example/a.png', 'https://user:secret@cdn.example/a.png', 'https://127.0.0.1/a.png', 'https://localhost/a.png']) {
    let calls = 0;
    const result = await invoke({ taskId: 'task_test', outputFormat: 'png' }, async () => {
      calls++;
      return Response.json({ data: { status: 'completed', result: { images: [{ url }] } } });
    }, { path: '/api/apimart/task' });
    assert.equal(result.status, 502); assert.equal(calls, 1); assert.equal(result.body.taskId, 'task_test');
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

test('uploaded reference and mask URLs pass through in order without server downloads or uploads', async () => {
  const images = ['https://cdn.example/reference-1.png', 'https://cdn.example/reference-2.jpeg'];
  const mask = 'https://cdn.example/mask.png';
  let calls = 0;
  const result = await invoke({ ...standardInput, images, mask }, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.apimart.ai/v1/images/generations');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.image_urls, images); assert.equal(body.mask_url, mask);
    assert.equal(JSON.stringify(body).includes('data:'), false);
    return Response.json({ data: [{ task_id: 'task_url_edit' }] });
  });
  assert.equal(calls, 1); assert.equal(result.status, 200);
  for (const url of ['http://cdn.example/ref.png', 'https://127.0.0.1/ref.png', 'https://user:secret@cdn.example/ref.png']) {
    for (const patch of [{ images: [url] }, { images, mask: url }]) {
      assert.equal((await invoke({ ...standardInput, ...patch }, async () => assert.fail('Unsafe URL'))).status, 400);
    }
  }
});

test('video middleware submits one task per click and polls the video result with the same credential', async () => {
  const images = ['https://cdn.example/first.png'];
  const models = [['seedance', 'seedance-2-5-flash'], ['kling', 'kling-v4-flash'], ['minimax', 'MiniMax-H3']] as const;
  for (const [model, upstreamModel] of models) {
    let submitted = 0;
    const result = await invoke({ model, prompt: 'video', ratio: '16:9', seconds: 5, options: { mode: 'first' }, images, videos: [], audio: [] }, async (url, init) => {
      submitted++;
      assert.equal(url, 'https://api.apimart.ai/v1/videos/generations');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer apimart-test-secret');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, upstreamModel);
      assert.deepEqual(body.image_with_roles, [{ url: images[0], role: 'first_frame' }]);
      assert.equal(body.aspect_ratio, undefined);
      return Response.json({ code: 200, data: [{ task_id: 'task_video' }] });
    }, { path: '/api/apimart/videos' });
    assert.equal(submitted, 1);
    assert.deepEqual(result, { status: 200, body: { taskId: 'task_video' } });
  }
  const upstream = (status: string) => async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(url, 'https://api.apimart.ai/v1/tasks/task_video?language=zh');
    assert.equal(init?.method, 'GET');
    return Response.json({ data: { status, error: { message: 'Reference rejected' }, result: {
      videos: [{ url: ['https://cdn.example/video.mp4'], last_frame_url: 'https://cdn.example/last.png' }],
    } } });
  };
  const path = '/api/apimart/video-task', taskId = 'task_video';
  assert.deepEqual(await invoke({ taskId }, upstream('processing'), { path }), { status: 200, body: { status: 'processing', taskId } });
  assert.deepEqual(await invoke({ taskId }, upstream('completed'), { path }), { status: 200, body: {
    status: 'completed', taskId, videoUrl: 'https://cdn.example/video.mp4', lastFrameUrl: 'https://cdn.example/last.png',
  } });
  assert.match((await invoke({ taskId }, upstream('failed'), { path })).body.error, /Reference rejected/);
  assert.equal((await invoke({ taskId: 'a/../../bad' }, async () => assert.fail('Invalid task ID cannot reach the provider'), { path })).status, 400);
});
