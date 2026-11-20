import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { captureMiddleware } from './testMiddleware.ts';
import { apiSettingsPlugin, checkApiConnection } from './apiSettings.ts';
import { providerConnection } from './apiCredentials.ts';
import { byokFetch, isPublicAddress } from './byokFetch.ts';
import { sunburstPlugin } from './sunburst.ts';
import { apimartPlugin } from './apimart.ts';
import { defaultSunburstSettings } from '../src/nodes/sunburst.ts';
import { defaultNanoBananaSettings } from '../src/nodes/nanoBanana.ts';
import type { ApiProvider } from '../src/components/apiSettings.ts';

const keys = { openai: 'default-openai', deepseek: 'default-deepseek', apimart: 'default-apimart' };
const customHeaders = (provider: ApiProvider, key = `custom-${provider}`) => ({
  'x-momoflow-provider': provider, 'x-momoflow-api-key': key, 'x-momoflow-base-url': 'https://gateway.example/prefix/v1/',
});
async function invoke(plugin: Plugin, path: string, body: unknown, headers: Record<string, string | undefined> = {}, hook: 'configureServer' | 'configurePreviewServer' = 'configureServer', method = 'POST') {
  const req = Object.assign(Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]), {
    url: path, method, headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'application/json', ...headers }, socket: {},
  });
  let status = 0;
  let text = '';
  let responseHeaders: Record<string, string> = {};
  const res = Object.assign(new EventEmitter(), {
    destroyed: false, writableEnded: false,
    writeHead(value: number, values: Record<string, string>) { status = value; responseHeaders = values; },
    end(value: string) { text = value; this.writableEnded = true; },
  });
  await captureMiddleware(plugin, hook)(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => assert.fail('Unexpected next'));
  return { status, body: JSON.parse(text), headers: responseHeaders };
}

for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  test(`${hook}: connection tests use authenticated reads, accept custom keys and fixed server defaults, and never disclose keys`, async () => {
    const calls: { url: string; key: string | null }[] = [];
    const upstream: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), key: new Headers(init?.headers).get('Authorization') });
      assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
      return String(url).endsWith('/balance') ? Response.json({ success: true, remain_balance: 0 }) : Response.json({ object: 'list', data: [] });
    };
    for (const provider of ['openai', 'apimart', 'deepseek'] as const) {
      for (const apiKey of ['', `custom-${provider}`]) {
        const result = await invoke(apiSettingsPlugin(keys, upstream), '/api/settings/test', { provider, apiKey, baseUrl: 'https://gateway.example/prefix/v1/' }, {}, hook);
        assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true });
        assert.equal(result.headers['Cache-Control'], 'no-store');
        const last = calls.at(-1)!;
        assert.equal(last.key, `Bearer ${apiKey || keys[provider]}`);
        assert.equal(last.url.startsWith('https://gateway.example/prefix/v1/'), Boolean(apiKey));
        assert.equal(JSON.stringify(result).includes(apiKey || keys[provider]), false);
      }
    }
    assert.equal(calls.length, 6);
  });

  test(`${hook}: all generation adapters select per-request BYOK credentials and retain environment defaults`, async () => {
    for (const custom of [false, true]) {
      let calls = 0;
      const upstream: typeof fetch = async (url, init) => {
        calls++;
        assert.equal(String(url), `${custom ? 'https://gateway.example/prefix/v1' : 'https://api.openai.com/v1'}/images/generations`);
        assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${custom ? 'custom-openai' : keys.openai}`);
        return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
      };
      const headers = custom ? customHeaders('openai') : {};
      const result = await invoke(sunburstPlugin(keys.openai, upstream), '/api/sunburst', { ...defaultSunburstSettings, provider: 'openai', prompt: 'test', images: [] }, headers, hook);
      assert.equal(result.status, 200); assert.equal(calls, 1);
      const nano = await invoke(apimartPlugin(keys.apimart, async (url, init) => {
        assert.equal(String(url), `${custom ? 'https://gateway.example/prefix/v1' : 'https://api.apimart.ai/v1'}/images/generations`);
        assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${custom ? 'custom-apimart' : keys.apimart}`);
        return Response.json({ data: [{ task_id: 'task_banana' }] });
      }), '/api/nano-banana', { ...defaultNanoBananaSettings, prompt: 'test', images: [] }, custom ? customHeaders('apimart') : {}, hook);
      assert.equal(nano.status, 200);
    }
  });
}

test('connection errors distinguish authorization, wrong URL, timeouts, rate limits, HTML, malformed JSON and public catalogs', async () => {
  const cases: [number, unknown, RegExp][] = [
    [401, {}, /Key/], [403, {}, /Key/], [404, {}, /地址/], [429, {}, /频繁/], [504, {}, /超时/], [402, {}, /余额/],
    [200, { error: { message: 'secret-key' } }, /未确认/], [200, { data: [] }, /模型列表/],
  ];
  for (const [status, body, expected] of cases) {
    await assert.rejects(checkApiConnection('openai', 'https://api.example/v1', 'test-key', new AbortController().signal, async () => Response.json(body, { status })), expected);
  }
  for (const text of ['<html>login</html>', '{', 'null', '[]']) {
    await assert.rejects(checkApiConnection('openai', 'https://api.example/v1', 'test-key', new AbortController().signal, async () => new Response(text)), /有效 API/);
  }
});

test('connection middleware validates trusted callers and inputs before any provider access', async () => {
  const plugin = apiSettingsPlugin(keys, async () => assert.fail('Must not access provider'));
  const input = { provider: 'openai', baseUrl: 'https://api.example/v1', apiKey: 'test-key' };
  for (const headers of [{ host: 'evil.example' }, { origin: 'https://evil.example' }, { origin: 'null' }]) assert.equal((await invoke(plugin, '/api/settings/test', input, headers)).status, 403);
  assert.equal((await invoke(plugin, '/api/settings/test', input, {}, 'configureServer', 'GET')).status, 405);
  for (const body of ['{', { ...input, provider: 'other' }, { ...input, provider: 'zenmux' }, { ...input, provider: 'wavespeed' }, { ...input, apiKey: 'bad key' }, { ...input, baseUrl: 'file:///private' }]) assert.equal((await invoke(plugin, '/api/settings/test', body)).status, 400);
  assert.equal((await invoke(apiSettingsPlugin({ ...keys, openai: '' }), '/api/settings/test', { ...input, apiKey: '' })).status, 503);
});

test('invalid or mismatched custom credentials fail without using the default key', () => {
  for (const headers of [
    { 'x-momoflow-api-key': 'test-key' }, customHeaders('apimart'),
    { ...customHeaders('openai'), 'x-momoflow-api-key': 'bad key' },
    { ...customHeaders('openai'), 'x-momoflow-base-url': 'http://localhost/private' },
  ]) assert.throws(() => providerConnection({ headers } as unknown as IncomingMessage, 'openai', 'default-secret', fetch), /配置无效/);
});

test('BYOK rejects private, loopback, metadata, mapped IPv6 and special-use destinations', async () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.31.4.5', '192.168.1.1', '100.64.0.1', '198.18.0.1', '192.0.2.4', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '2001:db8::1', '2001::1', '2002:7f00:0001::']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(address), true, address);
  for (const url of ['https://localhost/private', 'https://127.0.0.1/private', 'https://[::1]/private', 'https://169.254.169.254/latest', 'http://example.com']) await assert.rejects(byokFetch(url), /内网|HTTPS/);
});

test('concurrent BYOK requests retain their own keys and endpoints', async () => {
  const received: string[] = [];
  const plugin = sunburstPlugin('unused-default', async (url, init) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    received.push(`${url} ${new Headers(init?.headers).get('Authorization')}`);
    return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
  });
  const body = { ...defaultSunburstSettings, provider: 'openai', prompt: 'test', images: [] };
  const results = await Promise.all(['first', 'second'].map(id => invoke(plugin, '/api/sunburst', body, {
    ...customHeaders('openai', `key-${id}`), 'x-momoflow-base-url': `https://${id}.example/v1`,
  })));
  assert.ok(results.every(result => result.status === 200));
  assert.deepEqual(received.sort(), [
    'https://first.example/v1/images/generations Bearer key-first',
    'https://second.example/v1/images/generations Bearer key-second',
  ]);
});
