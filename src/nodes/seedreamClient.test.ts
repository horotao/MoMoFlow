import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { requestSeedream } from './seedreamClient.ts';
import { defaultSeedreamSettings } from './seedream.ts';
import { assetResources } from './assetResources.ts';
import { ModelRequestCancelled, modelTimeoutCode } from './modelRequestError.ts';

const request = { ...defaultSeedreamSettings, prompt: 'Test', images: [] };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fakeGlobal(context: TestContext, name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  context.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
}

test('Seedream preserves submission errors without retrying or leaking credentials', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls++; assert.equal(url, '/api/apimart/seedream');
    assert.deepEqual(JSON.parse(String(init?.body)), request);
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return Response.json({ error: 'APIMart HTTP 402 · Request ID: seedream-test' }, { status: 502 });
  });
  await assert.rejects(requestSeedream(request, new AbortController().signal), /seedream-test/);
  assert.equal(calls, 1);
});

test('Seedream rejects invalid parameters, too many references and pre-cancelled requests locally', async context => {
  context.mock.method(globalThis, 'fetch', async () => assert.fail('Must not submit'));
  await assert.rejects(requestSeedream(request, AbortSignal.abort()), { name: 'AbortError' });
  await assert.rejects(requestSeedream({ ...request, images: Array(11).fill('blob:ref') }, new AbortController().signal), /最多支持 10/);
  await assert.rejects(requestSeedream({ ...request, resolution: '1K' } as never, new AbortController().signal), /1.5K/);
  await assert.rejects(requestSeedream({ ...request, size: '512x512' }, new AbortController().signal), /总像素/);
  await assert.rejects(requestSeedream({ ...request, size: '4000x240' }, new AbortController().signal), /宽高比/);
});

test('Seedream polls the same task through timeout and processing, preserving provider bytes and dimensions', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let submissions = 0, polls = 0, closed = 0;
  const created: Blob[] = [];
  fakeGlobal(context, 'createImageBitmap', async () => ({ width: 2048, height: 1152, close() { closed++; } }));
  context.mock.method(assetResources, 'create', (blob: Blob) => { created.push(blob); return 'blob:seedream'; });
  context.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/apimart/seedream') { submissions++; return Response.json({ taskId: 'task_seedream' }); }
    if (url === '/api/apimart/task') {
      polls++; assert.deepEqual(JSON.parse(String(init?.body)), { taskId: 'task_seedream', outputFormat: 'jpeg' });
      if (polls === 1) return Response.json({ error: 'Query timed out', code: modelTimeoutCode }, { status: 502 });
      if (polls === 2) return Response.json({ status: 'processing' });
      return Response.json({ status: 'completed', imageUrl: 'https://cdn.example/result.jpeg', format: 'jpeg' });
    }
    assert.equal(url, 'https://cdn.example/result.jpeg');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.headers, undefined);
    return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'content-type': 'image/jpeg' } });
  });
  const pending = requestSeedream({ ...request, outputFormat: 'jpeg' }, new AbortController().signal);
  await flush();
  for (let i = 0; i < 3; i++) { context.mock.timers.tick(4000); await flush(); }
  const asset = await pending;
  assert.equal(submissions, 1); assert.equal(polls, 3); assert.equal(closed, 1);
  assert.deepEqual([asset.width, asset.height, asset.url], [2048, 1152, 'blob:seedream']);
  assert.deepEqual([...new Uint8Array(await created[0].arrayBuffer())], [255, 216, 255, 217]);
});

test('Seedream cancellation interrupts polling and never submits a replacement task', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let submissions = 0, polls = 0;
  const controller = new AbortController();
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/api/apimart/seedream') { submissions++; return Response.json({ taskId: 'task_cancel' }); }
    polls++; return Response.json({ status: 'processing' });
  });
  const pending = requestSeedream(request, controller.signal);
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  await flush(); controller.abort(); await rejection;
  context.mock.timers.tick(12000); await flush();
  assert.equal(submissions, 1); assert.equal(polls, 0);
});

test('Seedream failed, cancelled and malformed task responses retain the task ID without retrying', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const response of [
    { body: { error: 'Provider failure' }, status: 502 },
    { body: { status: 'cancelled' }, status: 200 },
    { body: { status: 'unknown' }, status: 200 },
    { body: { image: 'data:image/jpeg;base64,aGVsbG8=', format: 'jpeg' }, status: 200 },
  ]) {
    let submissions = 0, polls = 0;
    const mock = context.mock.method(globalThis, 'fetch', async (url: string) => {
      if (url === '/api/apimart/seedream') { submissions++; return Response.json({ taskId: 'task_failed' }); }
      polls++; return Response.json(response.body, { status: response.status });
    });
    const pending = requestSeedream(request, new AbortController().signal);
    const rejection = assert.rejects(pending, error => {
      assert.ok(error instanceof Error); assert.match(error.message, /task_failed/);
      if (response.body.status === 'cancelled') assert.ok(error instanceof ModelRequestCancelled);
      return true;
    });
    await flush(); context.mock.timers.tick(4000); await rejection;
    assert.equal(submissions, 1); assert.equal(polls, 1); mock.mock.restore();
  }
});

test('Seedream checks reference dimensions before creating a task', async context => {
  let submissions = 0;
  fakeGlobal(context, 'createImageBitmap', async () => ({ width: 9001, height: 4000, close() {} }));
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/api/apimart/seedream') submissions++;
    return new Response(new Blob(['ref'], { type: 'image/png' }));
  });
  await assert.rejects(requestSeedream({ ...request, images: ['blob:reference'] }, new AbortController().signal), /3600 万/);
  assert.equal(submissions, 0);
});
