import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { requestNanoBanana } from './nanoBananaClient.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';
import { assetResources } from './assetResources.ts';

const request = { ...defaultNanoBananaSettings, prompt: 'Test', images: [] };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('client retains provider error and request ID without retrying', async context => {
  let calls = 0;
  const error = 'APIMart 请求失败（429）\nRequest ID：banana-123';
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++; assert.equal(url, '/api/nano-banana');
    assert.deepEqual(JSON.parse(String(init.body)), request);
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    return Response.json({ error }, { status: 502 });
  });
  await assert.rejects(requestNanoBanana(request, new AbortController().signal), { message: error });
  assert.equal(calls, 1);
});

test('pre-cancelled and invalid requests never submit', async context => {
  context.mock.method(globalThis, 'fetch', async () => { assert.fail('must not submit'); });
  await assert.rejects(requestNanoBanana(request, AbortSignal.abort()), { name: 'AbortError' });
  await assert.rejects(requestNanoBanana({ ...request, images: Array(15).fill('blob:test') }, new AbortController().signal), /最多支持/);
});

test('client rejects a submission without a task ID', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/api/nano-banana');
    return Response.json({});
  });
  await assert.rejects(requestNanoBanana(request, new AbortController().signal), /未返回有效任务编号/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('a completed task without a result URL keeps the task ID and never resubmits', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const routes: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    routes.push(url);
    if (url === '/api/nano-banana') return Response.json({ taskId: 'task_banana' });
    assert.equal(url, '/api/apimart/task');
    return Response.json({ status: 'completed', taskId: 'task_banana', format: 'png' });
  });
  const rejected = assert.rejects(requestNanoBanana(request, new AbortController().signal), /未返回有效结果 URL。\n任务编号：task_banana/);
  await flush();
  context.mock.timers.tick(4000);
  await rejected;
  assert.deepEqual(routes, ['/api/nano-banana', '/api/apimart/task']);
});

function outputFixture(context: TestContext, format: string, onExport?: () => Blob | null) {
  const created: Blob[] = [], decoded: Blob[] = [];
  let closed = 0, exports = 0, submissions = 0, polls = 0, downloads = 0;
  let outputFormat: string;
  const global = (name: string, value: unknown) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    context.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  };
  global('createImageBitmap', async (blob: Blob) => {
    decoded.push(blob);
    return { width: 640, height: 360, close() { closed++; } };
  });
  global('document', { createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob(callback: BlobCallback, type: string) {
      exports++;
      callback(onExport ? onExport() : new Blob(['encoded image'], { type }));
    },
  }) });
  context.mock.timers.enable({ apis: ['setTimeout'] });
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url === '/api/nano-banana') {
      submissions++;
      outputFormat = JSON.parse(String(init.body)).outputFormat;
      return Response.json({ taskId: 'task_banana' });
    }
    if (url === '/api/apimart/task') {
      assert.deepEqual(JSON.parse(String(init.body)), { taskId: 'task_banana', outputFormat });
      if (++polls === 1) return Response.json({ status: 'processing', taskId: 'task_banana' });
      return Response.json({ status: 'completed', taskId: 'task_banana', imageUrl: 'https://cdn.example/result', format: outputFormat });
    }
    assert.equal(url, 'https://cdn.example/result');
    downloads++;
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    assert.equal(init.credentials, 'omit');
    return new Response(new Blob(['original image'], { type: `image/${format}` }));
  });
  context.mock.method(assetResources, 'create', (blob: Blob) => { created.push(blob); return `blob:banana-${created.length}`; });
  const run = async (input: Parameters<typeof requestNanoBanana>[0] = request, signal = new AbortController().signal) => {
    const pending = requestNanoBanana(input, signal);
    const handled = pending.catch(() => {});
    await flush();
    assert.equal(polls, 0);
    context.mock.timers.tick(4000);
    await flush();
    assert.equal(polls, 1);
    assert.equal(downloads, 0);
    context.mock.timers.tick(4000);
    await handled;
    assert.equal(polls, 2);
    assert.equal(downloads, 1);
    return pending;
  };
  return { run, created, decoded, closed: () => closed, exports: () => exports, submissions: () => submissions };
}

test('matching output format preserves original bytes and dimensions without re-encoding', async context => {
  const f = outputFixture(context, 'png');
  const [asset] = await f.run();
  assert.equal(f.created[0], f.decoded[0]);
  assert.equal(await f.created[0].text(), 'original image');
  assert.match(asset.name, /\.png$/);
  assert.deepEqual([asset.width, asset.height, asset.size], [640, 360, f.created[0].size]);
  assert.equal(f.exports(), 0); assert.equal(f.closed(), 1); assert.equal(f.submissions(), 1);
});

test('requested JPEG is encoded locally when the provider returns PNG', async context => {
  const f = outputFixture(context, 'png');
  const [asset] = await f.run({ ...request, outputFormat: 'jpeg' });
  assert.match(asset.name, /\.jpeg$/);
  assert.equal(f.created[0].type, 'image/jpeg');
  assert.equal(f.exports(), 1); assert.equal(f.closed(), 1); assert.equal(f.submissions(), 1);
});

test('cancellation during conversion releases the bitmap and never resubmits', async context => {
  const controller = new AbortController();
  const f = outputFixture(context, 'png', () => {
    controller.abort();
    return new Blob(['encoded'], { type: 'image/jpeg' });
  });
  await assert.rejects(f.run({ ...request, outputFormat: 'jpeg' }, controller.signal), { name: 'AbortError' });
  assert.equal(f.closed(), 1); assert.equal(f.created.length, 0); assert.equal(f.submissions(), 1);
});

for (const result of [null, new Blob(['fallback'], { type: 'image/png' })]) {
  test(`invalid conversion (${result?.type ?? 'null'}) keeps the task ID and never resubmits`, async context => {
    const f = outputFixture(context, 'png', () => result);
    await assert.rejects(f.run({ ...request, outputFormat: 'jpeg' }), /图片格式。\n任务编号：task_banana/);
    assert.equal(f.closed(), 1); assert.equal(f.created.length, 0); assert.equal(f.submissions(), 1);
  });
}
