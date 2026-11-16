import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { uploadApimartImages, readImageApiResponse } from './apimartUpload.ts';
import { apimartInputUrl } from './apimartResult.ts';
import { apiSettingsStorageKey } from '../components/apiSettings.ts';
import { requestSunburst } from './sunburstClient.ts';
import { requestSeedream } from './seedreamClient.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultSeedreamSettings } from './seedream.ts';

const headers = { 'X-MoMoFlow-Api-Key': 'test-upload-key', 'X-MoMoFlow-Base-Url': 'https://api.apimart.ai/v1' };
const endpoint = 'https://api.apimart.ai/v1/uploads/images?retention_days=3';
function globalFixture(t: TestContext, name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
}
function browserFixture(t: TestContext) {
  globalFixture(t, 'createImageBitmap', async () => ({ width: 100, height: 100, close() {} }));
  globalFixture(t, 'localStorage', { getItem: (key: string) => {
    assert.equal(key, apiSettingsStorageKey);
    return JSON.stringify({ provider: 'apimart', credentials: { apimart: { apiKey: headers['X-MoMoFlow-Api-Key'], baseUrl: headers['X-MoMoFlow-Base-Url'] } } });
  } });
}

test('direct upload sends original multipart bytes in order, only to the snapshotted provider', async t => {
  browserFixture(t);
  const blobs = [new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' }), new Blob(['second'], { type: 'image/jpeg' })];
  let count = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    const index = count++;
    assert.equal(url, 'https://gateway.example/v1/uploads/images?retention_days=3');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-upload-key');
    assert.equal(new Headers(init?.headers).has('content-type'), false);
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error');
    assert.equal(init?.referrerPolicy, 'no-referrer'); assert.equal(init?.mode, 'cors');
    assert.ok(init?.body instanceof FormData);
    assert.deepEqual([...init.body.keys()], ['file']);
    const file = init.body.get('file') as File;
    assert.equal(file.name, `reference-${index + 1}.${index ? 'jpeg' : 'png'}`);
    assert.equal(file.size, blobs[index].size);
    assert.deepEqual(await file.arrayBuffer(), await blobs[index].arrayBuffer());
    return Response.json({ url: `https://cdn.example/input-${index}.png` });
  });
  assert.deepEqual(await uploadApimartImages(blobs, { ...headers, 'X-MoMoFlow-Base-Url': 'https://gateway.example/v1/' }, new AbortController().signal),
    ['https://cdn.example/input-0.png', 'https://cdn.example/input-1.png']);
  assert.equal(count, 2);
});

test('all input limits are checked before any upload, including mask upload limits', async t => {
  browserFixture(t);
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Invalid files must not upload'));
  for (const blob of [new Blob([], { type: 'image/png' }), new Blob(['svg'], { type: 'image/svg+xml' }), new Blob([new Uint8Array(30 * 1024 * 1024 + 1)], { type: 'image/png' })]) {
    await assert.rejects(uploadApimartImages([new Blob(['valid'], { type: 'image/png' }), blob], headers, new AbortController().signal));
  }
  globalFixture(t, 'createImageBitmap', async () => ({ width: 8000, height: 6000, close() {} }));
  await assert.rejects(uploadApimartImages([new Blob(['oversized'], { type: 'image/png' })], headers, new AbortController().signal), /4000 万/);
});

test('upload errors redact keys and never retry; malformed URL and CORS failures are actionable', async t => {
  browserFixture(t);
  for (const makeResponse of [
    () => Response.json({ error: { message: 'Quota test-upload-key exhausted' } }, { status: 429 }),
    () => new Response('too large', { status: 413 }),
    () => new Response('gateway failure', { status: 502 }),
    () => Response.json({ url: 'http://cdn.example/ref.png' }),
    () => Response.json({ data: { url: 'https://cdn.example/ref.png' } }),
    () => { throw new TypeError('Failed to fetch'); },
  ]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, 'fetch', async () => { calls++; return makeResponse(); });
    await assert.rejects(uploadApimartImages([new Blob(['image'], { type: 'image/png' }), new Blob(['later'], { type: 'image/png' })], headers, new AbortController().signal), error => {
      assert.ok(error instanceof Error); assert.equal(error.message.includes('test-upload-key'), false);
      assert.equal(error.message.includes('npm run dev'), false); return true;
    });
    assert.equal(calls, 1); mock.mock.restore();
  }
});

test('cancelling a pending upload aborts it and prevents later uploads', async t => {
  browserFixture(t);
  const controller = new AbortController(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      controller.abort();
    });
  });
  await assert.rejects(uploadApimartImages([new Blob(['image'], { type: 'image/png' }), new Blob(['later'], { type: 'image/png' })], headers, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});

for (const provider of ['gpt', 'seedream'] as const) test(`${provider}: large reference bytes bypass the app API; failures never create a generation`, async t => {
  browserFixture(t);
  for (const failUpload of [false, true]) {
    const paths: string[] = [];
    const mock = t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      paths.push(url);
      if (url === 'blob:reference') return new Response(new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' }));
      if (url === endpoint) return failUpload ? Response.json({ error: { message: 'Upload quota exhausted' } }, { status: 429 }) : Response.json({ url: 'https://cdn.example/reference.png' });
      assert.equal(url, provider === 'gpt' ? '/api/apimart/images' : '/api/apimart/seedream');
      assert.ok(String(init?.body).length < 2048);
      assert.deepEqual(JSON.parse(String(init?.body)).images, ['https://cdn.example/reference.png']);
      assert.equal(String(init?.body).includes('data:'), false);
      return Response.json({ error: 'Mock generation boundary' }, { status: 502 });
    });
    const request = provider === 'gpt'
      ? requestSunburst({ ...defaultSunburstSettings, provider: 'apimart', prompt: 'Edit', images: ['blob:reference'] }, new AbortController().signal)
      : requestSeedream({ ...defaultSeedreamSettings, prompt: 'Edit', images: ['blob:reference'] }, new AbortController().signal);
    await assert.rejects(request, failUpload ? /Upload quota exhausted/ : /Mock generation boundary/);
    assert.equal(paths.length, failUpload ? 2 : 3); mock.mock.restore();
  }
});

test('URL validation rejects unsafe references and 413 never masquerades as a missing dev server', async () => {
  for (const url of ['http://cdn.example/a', 'https://127.0.0.1/a', 'https://localhost/a', 'https://user:pass@cdn.example/a', 'data:image/png;base64,aA==', 'https://cdn.example/' + 'x'.repeat(8192)]) {
    assert.throws(() => apimartInputUrl(url), /公开 HTTPS URL/);
  }
  await assert.rejects(readImageApiResponse(new Response('Request Entity Too Large', { status: 413 })), /HTTP 413/);
});

test('GPT uploads the validated alpha mask and sends only its URL alongside ordered image URLs', async t => {
  browserFixture(t);
  globalFixture(t, 'document', { createElement: () => ({
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }) }),
  }) });
  let uploads = 0, submissions = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url.startsWith('blob:')) return new Response(new Blob([url], { type: 'image/png' }));
    if (url === endpoint) {
      const file = (init?.body as FormData).get('file') as File;
      assert.equal(await file.text(), uploads === 0 ? 'blob:source' : 'blob:mask');
      return Response.json({ url: `https://cdn.example/input-${uploads++}.png` });
    }
    assert.equal(url, '/api/apimart/images'); submissions++;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.images, ['https://cdn.example/input-0.png']);
    assert.equal(body.mask, 'https://cdn.example/input-1.png');
    return Response.json({ error: 'Mock masked generation boundary' }, { status: 502 });
  });
  await assert.rejects(requestSunburst({ ...defaultSunburstSettings, provider: 'apimart', channelModel: 'gpt-image-2.6', prompt: 'Edit', images: ['blob:source'], mask: 'blob:mask' }, new AbortController().signal), /Mock masked generation boundary/);
  assert.equal(uploads, 2); assert.equal(submissions, 1);
});

test('hosted edits without BYOK fail before serializing or uploading image bytes', async t => {
  globalFixture(t, 'location', { hostname: 'momoflow-two.vercel.app' });
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Must not send images without a key'));
  await assert.rejects(uploadApimartImages([new Blob(['image'], { type: 'image/png' })], {}, new AbortController().signal), /填写 APIMart API Key/);
});
