import test from 'node:test';
import assert from 'node:assert/strict';
import { apiSettingsStorageKey, readApiSettings, saveApiSettings, validApiKey, validBaseUrl } from './apiSettings.ts';

test('API fields reject whitespace, non-ASCII characters and incomplete/unsafe URLs without changing the entered value', () => {
  for (const value of ['https://api.example.com/v1', 'https://proxy.example.com:8443/api/v1/']) assert.equal(validBaseUrl(value), true, value);
  for (const value of ['', 'example.com/v1', 'https:example.com', 'http://api.example.com', 'https://api.example.com/测试', 'https://中文.com', ' https://api.example.com', 'https://api.example.com/ ', 'https://user:pass@api.example.com', 'https://api.example.com?key=secret', 'https://api.example.com#fragment', 'https://api.example.com\\private', 'https://api.example.com\n']) assert.equal(validBaseUrl(value), false, value);
  for (const value of ['sk-test_only-123', 'a-provider-token', 'token.with_underscore']) assert.equal(validApiKey(value), true);
  for (const value of ['', ' ', 'sk- test', 'sk-中文', 'sk-test\n', 'sk-\u200btest', 'sk-\u007ftest', 'a'.repeat(4097)]) assert.equal(validApiKey(value), false);
});

test('API settings keep independent channel credentials, ignore corrupted entries and never use workflow storage', () => {
  let raw = '';
  const storage = { getItem(key: string) { assert.equal(key, apiSettingsStorageKey); return raw; }, setItem(key: string, value: string) { assert.equal(key, apiSettingsStorageKey); raw = value; } };
  const settings = { provider: 'openai' as const, credentials: { openai: { baseUrl: 'https://api.example.com/v1', apiKey: 'test-openai' }, zenmux: { baseUrl: 'https://proxy.example.com/v1', apiKey: 'test-zenmux' } } };
  saveApiSettings(settings, storage);
  assert.deepEqual(readApiSettings(storage), settings);
  raw = JSON.stringify({ provider: 'unknown', credentials: { openai: settings.credentials.openai, zenmux: { baseUrl: 'https://proxy.example.com', apiKey: 'bad key' }, unknown: { apiKey: 'other' } } });
  assert.deepEqual(readApiSettings(storage), { provider: 'openai', credentials: { openai: settings.credentials.openai } });
  for (const value of ['null', 'undefined', '[]', '{']) {
    raw = value;
    assert.deepEqual(readApiSettings(storage), { provider: 'openai', credentials: {} });
  }
  assert.deepEqual(readApiSettings({ getItem() { throw new Error('Storage denied'); } }), { provider: 'openai', credentials: {} });
  assert.throws(() => saveApiSettings(settings, { setItem() { throw new Error('Quota exceeded'); } }), /Quota exceeded/);
});

test('connection client sends draft credentials once, preserves cancellation and shows only local API error messages', async context => {
  const { ApiConnectionError, testApiConnection } = await import('./apiSettings.ts');
  const controller = new AbortController();
  let requests = 0;
  let error = false;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests++;
    assert.equal(url, '/api/settings/test');
    assert.equal(init.signal, controller.signal);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(String(init.body)), { provider: 'openai', apiKey: 'draft-only-test', baseUrl: 'https://draft.example/v1' });
    return error ? Response.json({ error: 'API Key 无效或权限不足' }, { status: 502 }) : Response.json({ ok: true });
  });
  await testApiConnection('openai', { apiKey: 'draft-only-test', baseUrl: 'https://draft.example/v1' }, controller.signal);
  error = true;
  await assert.rejects(testApiConnection('openai', { apiKey: 'draft-only-test', baseUrl: 'https://draft.example/v1' }, controller.signal), error => error instanceof ApiConnectionError && error.message === 'API Key 无效或权限不足');
  assert.equal(requests, 2);
});
