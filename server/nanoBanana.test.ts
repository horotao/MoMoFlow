import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApimartMiddleware } from './apimart.ts';
import { buildNanoBananaRequest } from './nanoBanana.ts';
import { defaultNanoBananaSettings, nanoBananaAspectRatios } from '../src/nodes/nanoBanana.ts';

const input = { ...defaultNanoBananaSettings, prompt: ' Test ', images: [] };
const png = 'data:image/png;base64,aGVsbG8=';

test('Nano Banana uses the pinned model and documented ratios and tiers, without an upstream output_format', () => {
  for (const aspectRatio of nanoBananaAspectRatios) {
    assert.deepEqual(buildNanoBananaRequest({ ...input, aspectRatio, imageSize: '4K', outputFormat: 'jpeg' }), {
      images: [], body: { model: 'gemini-nano-banana-2.1', prompt: 'Test', size: aspectRatio, resolution: '4K', n: 1 },
    });
  }
  for (const change of [{ prompt: '' }, { imageSize: '0.5K' }, { images: Array(15).fill(png) }, { images: ['data:image/gif;base64,aGVsbG8='] }, { images: ['https://127.0.0.1/image.png'] }]) {
    assert.throws(() => buildNanoBananaRequest({ ...input, ...change }));
  }
  assert.throws(() => buildNanoBananaRequest({ ...input, model: 'unrelated-model' }), /不支持的 Nano Banana 模型/);
  const pro = { ...input, model: 'gemini-3-pro-image-preview' };
  for (const aspectRatio of ['1:4', '4:1', '1:8', '8:1']) {
    assert.throws(() => buildNanoBananaRequest({ ...pro, aspectRatio }), /不支持的 Nano Banana 图片参数/);
  }
  assert.deepEqual(buildNanoBananaRequest({ ...pro, aspectRatio: '21:9', imageSize: '2K' }), {
    images: [], body: { model: 'gemini-3-pro-image-preview', prompt: 'Test', size: '21:9', resolution: '2K', n: 1 },
  });
});

async function invoke(fetchProvider: typeof fetch, path: string, body: unknown) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: path, method: 'POST', socket: {}, headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'application/json' },
  });
  let status = 0, result: unknown;
  const res = Object.assign(new EventEmitter(), {
    destroyed: false, writableEnded: false,
    writeHead(code: number) { status = code; },
    end(text: string) { result = JSON.parse(text); this.writableEnded = true; },
  });
  await createApimartMiddleware('test-key', fetchProvider)(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => assert.fail('Route not handled'));
  return { status, result };
}

test('local Nano Banana Pro uploads attachments in order, submits once, and polls the same task for its CDN URL', async () => {
  const calls: string[] = [];
  let polls = 0;
  const upstream: typeof fetch = async (url, init) => {
    const { pathname, search } = new URL(String(url));
    calls.push(`${pathname}${search}`);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key');
    if (pathname === '/v1/uploads/images') {
      assert.equal(init?.method, 'POST');
      assert.ok(init?.body instanceof FormData);
      const file = init.body.get('file');
      assert.ok(file instanceof File);
      assert.equal(file.name, `reference-${calls.length}.png`);
      assert.equal(await file.text(), 'hello');
      return Response.json({ url: `https://cdn.example/ref-${calls.length}.png` });
    }
    if (pathname === '/v1/images/generations') {
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init.body)), {
        model: 'gemini-3-pro-image-preview', prompt: 'Test', size: 'auto', resolution: '1K', n: 1,
        image_urls: ['https://cdn.example/ref-1.png', 'https://cdn.example/ref-2.png'],
      });
      return Response.json({ code: 200, data: [{ status: 'submitted', task_id: 'task_banana' }] });
    }
    assert.equal(pathname, '/v1/tasks/task_banana');
    assert.equal(init?.method, 'GET');
    if (++polls === 1) return Response.json({ code: 200, data: { status: 'processing' } });
    return Response.json({ code: 200, data: { status: 'completed', result: { images: [{ url: ['https://cdn.example/output.jpg'], expires_at: 123 }] } } });
  };
  assert.deepEqual(await invoke(upstream, '/api/nano-banana', { ...input, model: 'gemini-3-pro-image-preview', images: [png, png] }), { status: 200, result: { taskId: 'task_banana' } });
  const poll = { taskId: 'task_banana', outputFormat: 'png' };
  assert.deepEqual(await invoke(upstream, '/api/apimart/task', poll), {
    status: 200, result: { status: 'processing', taskId: 'task_banana' },
  });
  assert.deepEqual(await invoke(upstream, '/api/apimart/task', poll), {
    status: 200, result: { status: 'completed', taskId: 'task_banana', imageUrl: 'https://cdn.example/output.jpg', format: 'png', expiresAt: 123 },
  });
  assert.deepEqual(calls, [
    '/v1/uploads/images?retention_days=3', '/v1/uploads/images?retention_days=3', '/v1/images/generations',
    '/v1/tasks/task_banana?language=zh', '/v1/tasks/task_banana?language=zh',
  ]);
});

test('failed reference upload stops generation before submission', async () => {
  let calls = 0;
  const result = await invoke(async url => {
    calls++;
    assert.match(String(url), /\/uploads\/images\?/);
    return Response.json({ error: { message: 'bad file' } }, { status: 400 });
  }, '/api/nano-banana', { ...input, images: [png] });
  assert.equal(result.status, 502);
  assert.equal(calls, 1);
});
