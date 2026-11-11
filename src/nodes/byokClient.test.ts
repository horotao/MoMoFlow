import test from 'node:test';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { apiSettingsStorageKey, saveApiSettings } from '../components/apiSettings.ts';
import { requestSunburst } from './sunburstClient.ts';
import { requestNanoBanana } from './nanoBananaClient.ts';
import { requestIdeogram } from './ideogramClient.ts';
import { requestDescription } from './describerClient.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';
import { defaultIdeogramSettings } from './ideogram.ts';
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
    zenmux: { baseUrl: 'https://zenmux-proxy.example/api/v1', apiKey: 'test-zenmux' },
    deepseek: { baseUrl: 'https://deepseek-proxy.example/v1', apiKey: 'test-deepseek' },
    wavespeed: { baseUrl: 'https://wavespeed-proxy.example/api/v3', apiKey: 'test-wavespeed' },
  };
  for (const configured of [true, false]) {
    saveApiSettings({ provider: 'wavespeed', credentials: configured ? credentials : {} }, storage);
    for (const provider of ['openai', 'zenmux', 'wavespeed'] as const) {
      let count = 0;
      const mock = context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        count++;
        assert.equal(url, provider === 'wavespeed' ? '/api/ideogram' : '/api/sunburst');
        const headers = new Headers(init.headers);
        assert.equal(headers.get('X-MoMoFlow-Provider'), configured ? provider : null);
        assert.equal(headers.get('X-MoMoFlow-Api-Key'), configured ? credentials[provider].apiKey : null);
        assert.equal(headers.get('X-MoMoFlow-Base-Url'), configured ? credentials[provider].baseUrl : null);
        assert.equal(headers.has('Authorization'), false);
        assert.equal(JSON.stringify(JSON.parse(String(init.body))).includes('apiKey'), false);
        return Response.json({ error: 'fixture-stop' }, { status: 502 });
      });
      const signal = new AbortController().signal;
      await assert.rejects(provider === 'wavespeed'
        ? requestIdeogram({ ...defaultIdeogramSettings, prompt: 'test' }, signal)
        : requestSunburst({ ...defaultSunburstSettings, provider, prompt: 'test', images: [] }, signal), /fixture-stop/);
      assert.equal(count, 1);
      mock.mock.restore();
    }
    const mock = context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, '/api/nano-banana');
      assert.equal(new Headers(init.headers).get('X-MoMoFlow-Api-Key'), configured ? 'test-zenmux' : null);
      return Response.json({ error: 'fixture-stop' }, { status: 502 });
    });
    await assert.rejects(requestNanoBanana({ ...defaultNanoBananaSettings, prompt: 'test', images: [] }, new AbortController().signal), /fixture-stop/);
    mock.mock.restore();
  }
});

test('description freezes saved credentials before reading images and keeps keys off image downloads', async context => {
  const storage = browserStorage(context);
  const configure = (apiKey: string) => saveApiSettings({ provider: 'deepseek', credentials: { deepseek: { apiKey, baseUrl: 'https://proxy.example/v1' } } }, storage);
  configure('test-original');
  const originalReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  class FileReaderFixture {
    result = 'data:image/png;base64,aGVsbG8=';
    onload?: () => void;
    readAsDataURL() { this.onload?.(); }
  }
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: FileReaderFixture });
  context.after(() => { if (originalReader) Object.defineProperty(globalThis, 'FileReader', originalReader); else Reflect.deleteProperty(globalThis, 'FileReader'); });
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url === 'blob:test-source') {
      assert.equal(init.headers, undefined);
      configure('test-changed');
      return new Response(new Blob(['test'], { type: 'image/png' }));
    }
    assert.equal(url, '/api/describer');
    assert.equal(new Headers(init.headers).get('X-MoMoFlow-Api-Key'), 'test-original');
    return Response.json({ text: 'description' });
  });
  const task = { model: 'deepseek-flash', instructions: '', images: ['blob:test-source'] } as PreviewTask;
  assert.equal(await requestDescription(task, new AbortController().signal), 'description');
});
