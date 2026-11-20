import test from 'node:test';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { apiSettingsStorageKey, saveApiSettings } from '../components/apiSettings.ts';
import { requestSunburst } from './sunburstClient.ts';
import { requestNanoBanana } from './nanoBananaClient.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';

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
    let count = 0;
    const sunburstMock = context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      count++;
      assert.equal(url, '/api/sunburst');
      const headers = new Headers(init.headers);
      assert.equal(headers.get('X-MoMoFlow-Provider'), configured ? 'openai' : null);
      assert.equal(headers.get('X-MoMoFlow-Api-Key'), configured ? credentials.openai.apiKey : null);
      assert.equal(headers.get('X-MoMoFlow-Base-Url'), configured ? credentials.openai.baseUrl : null);
      assert.equal(headers.has('Authorization'), false);
      assert.equal(JSON.stringify(JSON.parse(String(init.body))).includes('apiKey'), false);
      return Response.json({ error: 'fixture-stop' }, { status: 502 });
    });
    const signal = new AbortController().signal;
    await assert.rejects(requestSunburst({ ...defaultSunburstSettings, provider: 'openai', prompt: 'test', images: [] }, signal), /fixture-stop/);
    assert.equal(count, 1);
    sunburstMock.mock.restore();
    const mock = context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, '/api/nano-banana');
      assert.equal(new Headers(init.headers).get('X-MoMoFlow-Api-Key'), configured ? 'test-apimart' : null);
      return Response.json({ error: 'fixture-stop' }, { status: 502 });
    });
    await assert.rejects(requestNanoBanana({ ...defaultNanoBananaSettings, prompt: 'test', images: [] }, new AbortController().signal), /fixture-stop/);
    mock.mock.restore();
  }
});
