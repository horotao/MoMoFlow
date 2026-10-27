import test from 'node:test';
import assert from 'node:assert/strict';
import { requestIdeogram } from './ideogramClient.ts';
import { defaultIdeogramSettings } from './ideogram.ts';
import { assetResources } from './assetResources.ts';

const request = { ...defaultIdeogramSettings, prompt: 'Test poster' };
const signal = () => new AbortController().signal;
test('client submits without credentials once and preserves server error/task ID', async context => {
  let calls = 0;
  const error = 'WaveSpeed HTTP 402 · Task ID: pred_123';
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++; assert.equal(url, '/api/ideogram');
    assert.deepEqual(JSON.parse(String(init.body)), request);
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    return Response.json({ error }, { status: 502 });
  });
  await assert.rejects(requestIdeogram(request, signal()), { message: error });
  assert.equal(calls, 1);
});

test('pre-cancelled and invalid requests never submit', async context => {
  context.mock.method(globalThis, 'fetch', async () => { assert.fail('must not submit'); });
  await assert.rejects(requestIdeogram(request, AbortSignal.abort()), { name: 'AbortError' });
  await assert.rejects(requestIdeogram({ ...request, prompt: '' }, signal()), /非空提示词/);
});

test('imports temporary URLs as managed blobs, preserves bytes/dimensions and releases partial results on failure', async context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let closed = 0;
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 1024, height: 1024, close() { closed++; } }) });
  context.after(() => { if (descriptor) Object.defineProperty(globalThis, 'createImageBitmap', descriptor); else Reflect.deleteProperty(globalThis, 'createImageBitmap'); });
  const blobs: Blob[] = [], discarded: string[][] = [];
  context.mock.method(assetResources, 'create', (blob: Blob) => { blobs.push(blob); return `blob:output-${blobs.length}`; });
  context.mock.method(assetResources, 'discard', (urls: Iterable<string>) => { discarded.push([...urls]); });
  let broken = false;
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/api/ideogram') return Response.json({ taskId: 'pred_123', outputs: broken ? ['https://cdn.example/a.png', 'https://cdn.example/bad.png'] : ['https://cdn.example/a.png'] });
    if (url.endsWith('bad.png')) return new Response('bad', { status: 403 });
    return new Response(new Blob(['original bytes'], { type: 'image/png' }));
  });
  const [asset] = await requestIdeogram(request, signal());
  assert.equal(asset.url, 'blob:output-1'); assert.equal(asset.width, 1024); assert.equal(asset.height, 1024);
  assert.equal(await blobs[0].text(), 'original bytes'); assert.equal(closed, 1);
  broken = true;
  await assert.rejects(requestIdeogram(request, signal()), /pred_123/);
  assert.deepEqual(discarded, [['blob:output-2']]); assert.equal(closed, 2);
});

test('invalid outputs never fetch unsafe URLs or resubmit', async context => {
  for (const outputs of [[], [{}], ['file:///private'], ['http://localhost/private'], ['https://user:secret@host.test/a.png']]) {
    let calls = 0;
    const mock = context.mock.method(globalThis, 'fetch', async (url: string) => {
      calls++; assert.equal(url, '/api/ideogram'); return Response.json({ taskId: 'pred_123', outputs });
    });
    await assert.rejects(requestIdeogram(request, signal()), /pred_123/);
    assert.equal(calls, 1); mock.mock.restore();
  }
});
