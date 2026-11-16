import test from 'node:test';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { apiSettingsStorageKey, saveApiSettings } from '../components/apiSettings.ts';
import { requestSunburst } from './sunburstClient.ts';
import { requestNanoBanana } from './nanoBananaClient.ts';
import { requestDescription } from './describerClient.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';
import type { PreviewTask } from './taskQueue';

function browserStorage(context: TestContext) {
  let value: string | null = null;
  const storage = {
    getItem(key: string) { return key === apiSettingsStorageKey ? value : null; },
    setItem(key: string, next: string) { assert.equal(key, apiSettingsStorageKey); value = next; },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  context.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  return storage;
}

test('model clients attach only their own saved channel to local APIs and omit credentials when using server defaults', async context => {
  const storage = browserStorage(context);
  const credentials = {
    openai: { baseUrl: 'https://openai-proxy.example/v1', apiKey: 'test-openai' },
    apimart: { baseUrl: 'https://apimart-proxy.example/api/v1', apiKey: 'test-apimart' },
    deepseek: { baseUrl: 'https://deepseek-proxy.example/v1', apiKey: 'test-deepseek' },
  };
  for (const configured of [true, false]) {
    saveApiSettings({ provider: 'apimart', credentials: configured ? credentials : {} }, storage);
    for (const provider of ['openai', 'zenmux'] as const) {
      let count = 0;
      const mock = context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        count++;
        assert.equal(url, '/api/sunburst');
        const headers = new Headers(init.headers);
        assert.equal(headers.get('X-MoMoFlow-Provider'), configured && provider === 'openai' ? provider : null);
        assert.equal(headers.get('X-MoMoFlow-Api-Key'), configured && provider === 'openai' ? credentials.openai.apiKey : null);
        assert.equal(headers.get('X-MoMoFlow-Base-Url'), configured && provider === 'openai' ? credentials.openai.baseUrl : null);
        assert.equal(headers.has('Authorization'), false);
        assert.equal(JSON.stringify(JSON.parse(String(init.body))).includes('apiKey'), false);
        return Response.json({ error: 'fixture-stop' }, { status: 502 });
      });
      const signal = new AbortController().signal;
      await assert.rejects(requestSunburst({ ...defaultSunburstSettings, provider, prompt: 'test', images: [] }, signal), /fixture-stop/);
      assert.equal(count, 1);
      mock.mock.restore();
    }
    const mock = context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, '/api/nano-banana');
      assert.equal(new Headers(init.headers).get('X-MoMoFlow-Api-Key'), configured ? 'test-apimart' : null);
      return Response.json({ error: 'fixture-stop' }, { status: 502 });
    });
    await assert.rejects(requestNanoBanana({ ...defaultNanoBananaSettings, prompt: 'test', images: [] }, new AbortController().signal), /fixture-stop/);
    mock.mock.restore();
  }
});

test('description uploads large originals with a one-hour lifetime and sends only ordered file IDs and instructions', async context => {
  const storage = browserStorage(context);
  const configure = (apiKey: string) => saveApiSettings({ provider: 'deepseek', credentials: { deepseek: { apiKey, baseUrl: 'https://proxy.example/v1' } } }, storage);
  configure('test-original');
  const bytes = new Uint8Array(5 * 1024 * 1024).fill(42);
  const second = new Uint8Array([1, 2, 3]);
  let uploads = 0;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.startsWith('blob:')) {
      assert.equal(init.headers, undefined);
      assert.equal(uploads, 0);
      configure('test-changed');
      return new Response(new Blob([url === 'blob:large' ? bytes : second], { type: 'image/png' }));
    }
    if (url === 'https://proxy.example/v1/files') {
      assert.equal(init.method, 'POST');
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-original');
      assert.equal(init.credentials, 'omit');
      assert.equal(init.redirect, 'error');
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('purpose'), 'user_data');
      assert.equal(init.body.get('expires_after[anchor]'), 'created_at');
      assert.equal(init.body.get('expires_after[seconds]'), '3600');
      const file = init.body.get('file');
      assert.ok(file instanceof File);
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), uploads === 0 ? bytes : second);
      return Response.json({ id: `file-api-image-${++uploads}` });
    }
    assert.equal(url, '/api/describer');
    assert.equal(new Headers(init.headers).get('X-MoMoFlow-Api-Key'), 'test-original');
    assert.equal(new Headers(init.headers).get('X-MoMoFlow-Base-Url'), 'https://proxy.example/v1');
    assert.ok(Buffer.byteLength(String(init.body)) < 200);
    assert.deepEqual(JSON.parse(String(init.body)), { instructions: '使用中文', fileIds: ['file-api-image-1', 'file-api-image-2'] });
    return Response.json({ text: 'description' });
  });
  const task = { model: 'deepseek-flash', instructions: '使用中文', images: ['blob:large', 'blob:second'] } as PreviewTask;
  assert.equal(await requestDescription(task, new AbortController().signal), 'description');
  assert.equal(uploads, 2);
});

test('description stops on upload failure, malformed file ID or cancellation', async context => {
  const storage = browserStorage(context);
  saveApiSettings({ provider: 'deepseek', credentials: { deepseek: { apiKey: 'test-key', baseUrl: 'https://api.deepseek.com' } } }, storage);
  const task = { model: 'deepseek-flash', images: ['blob:one', 'blob:two'] } as PreviewTask;
  for (const failure of ['rate limit', 'malformed ID', 'cancelled']) {
    const controller = new AbortController();
    let uploads = 0;
    const mock = context.mock.method(globalThis, 'fetch', async (url: string) => {
      if (url.startsWith('blob:')) return new Response(new Blob(['image'], { type: 'image/png' }));
      assert.equal(url, 'https://api.deepseek.com/files');
      uploads++;
      if (failure === 'cancelled') controller.abort(new Error('cancelled'));
      return failure === 'rate limit' ? Response.json({}, { status: 429 }) : Response.json({ id: 'invalid' });
    });
    await assert.rejects(requestDescription(task, controller.signal), failure === 'rate limit' ? /429/ : failure === 'cancelled' ? /cancelled/ : /文件 ID/);
    assert.equal(uploads, 1);
    mock.mock.restore();
  }
});
