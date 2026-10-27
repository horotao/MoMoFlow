import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { requestNanoBanana } from './nanoBananaClient.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';
import { assetResources } from './assetResources.ts';

const request = { ...defaultNanoBananaSettings, prompt: 'Test', images: [] };
test('client retains provider error and request ID without retrying', async context => {
  let calls = 0;
  const error = 'ZenMux 请求失败（429）\nRequest ID：banana-123';
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

test('client rejects a successful response with no images', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ images: [] }));
  await assert.rejects(requestNanoBanana(request, new AbortController().signal), /未返回有效图片/);
});

function outputFixture(context: TestContext, types: string[], onExport?: (index: number) => Blob | null) {
  const created: Blob[] = [], decoded: Blob[] = [], discarded: string[][] = [];
  let closed = 0, exports = 0, submissions = 0;
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
      callback(onExport ? onExport(exports) : new Blob(['encoded image'], { type }));
    },
  }) });
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/api/nano-banana') {
      submissions++;
      return Response.json({ images: types.map(type => ({ image: `data:image/${type};base64,aGVsbG8=` })) });
    }
    assert.match(url, /^data:image\/(png|jpeg|webp);base64,/);
    return new Response(new Blob(['original image'], { type: url.slice(5, url.indexOf(';')) }));
  });
  context.mock.method(assetResources, 'create', (blob: Blob) => { created.push(blob); return `blob:banana-${created.length}`; });
  context.mock.method(assetResources, 'discard', (urls: Iterable<string>) => { discarded.push([...urls]); });
  return { created, decoded, discarded, closed: () => closed, exports: () => exports, submissions: () => submissions };
}

test('matching output format preserves original bytes and dimensions without re-encoding', async context => {
  const f = outputFixture(context, ['png']);
  const [asset] = await requestNanoBanana(request, new AbortController().signal);
  assert.equal(f.created[0], f.decoded[0]);
  assert.match(asset.name, /\.png$/);
  assert.deepEqual([asset.width, asset.height, asset.size], [640, 360, f.created[0].size]);
  assert.equal(f.exports(), 0); assert.equal(f.closed(), 1); assert.equal(f.submissions(), 1);
});

test('local JPEG conversion uses requested format for every output and closes decoded images', async context => {
  const f = outputFixture(context, ['png', 'webp', 'jpeg']);
  const assets = await requestNanoBanana({ ...request, outputFormat: 'jpeg' }, new AbortController().signal);
  assert.equal(assets.length, 3);
  assert.ok(assets.every(asset => asset.name.endsWith('.jpeg') && asset.width === 640 && asset.height === 360));
  assert.ok(f.created.every(blob => blob.type === 'image/jpeg'));
  assert.equal(f.created[2], f.decoded[2]);
  assert.equal(f.exports(), 2); assert.equal(f.closed(), 3); assert.equal(f.submissions(), 1);
});

test('cancellation during conversion discards earlier results and never resubmits', async context => {
  const controller = new AbortController();
  const f = outputFixture(context, ['jpeg', 'png'], () => {
    controller.abort(); return new Blob(['encoded'], { type: 'image/jpeg' });
  });
  await assert.rejects(requestNanoBanana({ ...request, outputFormat: 'jpeg' }, controller.signal), { name: 'AbortError' });
  assert.deepEqual(f.discarded, [['blob:banana-1']]);
  assert.equal(f.closed(), 2); assert.equal(f.created.length, 1); assert.equal(f.submissions(), 1);
});

for (const exported of [null, new Blob(['fallback'], { type: 'image/png' })]) {
  test(`failed JPEG encoding (${exported?.type ?? 'null'}) discards partial results without retry`, async context => {
    const f = outputFixture(context, ['jpeg', 'png'], () => exported);
    await assert.rejects(requestNanoBanana({ ...request, outputFormat: 'jpeg' }, new AbortController().signal), /图片格式/);
    assert.deepEqual(f.discarded, [['blob:banana-1']]);
    assert.equal(f.closed(), 2); assert.equal(f.created.length, 1); assert.equal(f.submissions(), 1);
  });
}
