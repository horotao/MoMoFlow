import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { captureMiddleware } from './testMiddleware.ts';
import { apiSettingsPlugin, checkApiConnection } from './apiSettings.ts';
import { providerConnection, zenmuxVertexBase } from './apiCredentials.ts';
import { byokFetch, isPublicAddress } from './byokFetch.ts';
import { sunburstPlugin } from './sunburst.ts';
import { nanoBananaPlugin } from './nanoBanana.ts';
import { deepseekPlugin } from './deepseek.ts';
import { ideogramPlugin } from './ideogram.ts';
import { defaultSunburstSettings } from '../src/nodes/sunburst.ts';
import { defaultNanoBananaSettings } from '../src/nodes/nanoBanana.ts';
import { defaultIdeogramSettings } from '../src/nodes/ideogram.ts';
import type { ApiProvider } from '../src/components/apiSettings.ts';

const keys = { openai: 'default-openai', zenmux: 'default-zenmux', deepseek: 'default-deepseek', wavespeed: 'default-wavespeed' };
const png = 'data:image/png;base64,aGVsbG8=';
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
      if (String(url).includes('/management/generation')) return Response.json({ success: false, message: 'Generation not found', data: null }, { status: 404 });
      return String(url).endsWith('/balance') ? Response.json({ code: 200, data: { balance: 0 } }) : Response.json({ object: 'list', data: [] });
    };
    for (const provider of ['openai', 'zenmux', 'deepseek', 'wavespeed'] as const) {
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
    assert.equal(calls.length, 8);
  });

  test(`${hook}: all generation adapters select per-request BYOK credentials and retain environment defaults`, async () => {
    for (const custom of [false, true]) {
      for (const provider of ['openai', 'zenmux'] as const) {
        let calls = 0;
        const upstream: typeof fetch = async (url, init) => {
          calls++;
          assert.equal(String(url), `${custom ? 'https://gateway.example/prefix/v1' : provider === 'openai' ? 'https://api.openai.com/v1' : 'https://zenmux.ai/api/v1'}/images/generations`);
          assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${custom ? `custom-${provider}` : keys[provider]}`);
          return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
        };
        const result = await invoke(sunburstPlugin(keys, upstream), '/api/sunburst', { ...defaultSunburstSettings, provider, prompt: 'test', images: [] }, custom ? customHeaders(provider) : {}, hook);
        assert.equal(result.status, 200); assert.equal(calls, 1);
      }
      const nano = await invoke(nanoBananaPlugin(keys.zenmux, async (url, init) => {
        assert.equal(String(url).startsWith(custom ? 'https://gateway.example/prefix/vertex-ai/v1/' : 'https://zenmux.ai/api/vertex-ai/v1/'), true);
        assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${custom ? 'custom-zenmux' : keys.zenmux}`);
        return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }] });
      }), '/api/nano-banana', { ...defaultNanoBananaSettings, prompt: 'test', images: [] }, custom ? customHeaders('zenmux') : {}, hook);
      assert.equal(nano.status, 200);
      const deepseek = await invoke(deepseekPlugin(keys.deepseek, async (url, init) => {
        assert.equal(String(url), `${custom ? 'https://gateway.example/prefix/v1' : 'https://api.deepseek.com'}/chat/completions`);
        assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${custom ? 'custom-deepseek' : keys.deepseek}`);
        return Response.json({ choices: [{ message: { content: 'test description' }, finish_reason: 'stop' }] });
      }), '/api/describer', { model: 'deepseek-flash', instructions: '', images: [png] }, custom ? customHeaders('deepseek') : {}, hook);
      assert.equal(deepseek.status, 200);
      const ideogram = await invoke(ideogramPlugin(keys.wavespeed, async (url, init) => {
        assert.equal(String(url).startsWith(custom ? 'https://gateway.example/prefix/v1/' : 'https://api.wavespeed.ai/api/v3/'), true);
        assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${custom ? 'custom-wavespeed' : keys.wavespeed}`);
        return Response.json({ code: 200, data: { id: 'prediction-test', status: 'completed', outputs: ['https://cdn.example/result.png'] } });
      }), '/api/ideogram', { ...defaultIdeogramSettings, prompt: 'test' }, custom ? customHeaders('wavespeed') : {}, hook);
      assert.equal(ideogram.status, 200);
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
  await assert.rejects(checkApiConnection('zenmux', 'https://api.example/v1', 'test-key', new AbortController().signal, async () => Response.json({ object: 'list', data: [] })), /认证/);
});

test('connection middleware validates trusted callers and inputs before any provider access', async () => {
  const plugin = apiSettingsPlugin(keys, async () => assert.fail('Must not access provider'));
  const input = { provider: 'openai', baseUrl: 'https://api.example/v1', apiKey: 'test-key' };
  for (const headers of [{ host: 'evil.example' }, { origin: 'https://evil.example' }, { origin: 'null' }]) assert.equal((await invoke(plugin, '/api/settings/test', input, headers)).status, 403);
  assert.equal((await invoke(plugin, '/api/settings/test', input, {}, 'configureServer', 'GET')).status, 405);
  for (const body of ['{', { ...input, provider: 'other' }, { ...input, apiKey: 'bad key' }, { ...input, baseUrl: 'file:///private' }]) assert.equal((await invoke(plugin, '/api/settings/test', body)).status, 400);
  assert.equal((await invoke(apiSettingsPlugin({ ...keys, openai: '' }), '/api/settings/test', { ...input, apiKey: '' })).status, 503);
});

test('invalid or mismatched custom credentials fail without using the default key', () => {
  for (const headers of [
    { 'x-momoflow-api-key': 'test-key' }, customHeaders('zenmux'),
    { ...customHeaders('openai'), 'x-momoflow-api-key': 'bad key' },
    { ...customHeaders('openai'), 'x-momoflow-base-url': 'http://localhost/private' },
  ]) assert.throws(() => providerConnection({ headers } as unknown as IncomingMessage, 'openai', 'default-secret', fetch), /配置无效/);
  assert.equal(zenmuxVertexBase('https://proxy.example/custom/v1'), 'https://proxy.example/custom/vertex-ai/v1');
});

test('BYOK rejects private, loopback, metadata, mapped IPv6 and special-use destinations', async () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.31.4.5', '192.168.1.1', '100.64.0.1', '198.18.0.1', '192.0.2.4', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '2001:db8::1', '2001::1', '2002:7f00:0001::']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(address), true, address);
  for (const url of ['https://localhost/private', 'https://127.0.0.1/private', 'https://[::1]/private', 'https://169.254.169.254/latest', 'http://example.com']) await assert.rejects(byokFetch(url), /内网|HTTPS/);
});

test('concurrent BYOK requests retain their own keys and endpoints', async () => {
  const received: string[] = [];
  const plugin = deepseekPlugin('unused-default', async (url, init) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    received.push(`${url} ${new Headers(init?.headers).get('Authorization')}`);
    return Response.json({ choices: [{ message: { content: 'description' }, finish_reason: 'stop' }] });
  });
  const body = { model: 'deepseek-flash', instructions: '', images: [png] };
  const results = await Promise.all(['first', 'second'].map(id => invoke(plugin, '/api/describer', body, {
    ...customHeaders('deepseek', `key-${id}`), 'x-momoflow-base-url': `https://${id}.example/v1`,
  })));
  assert.ok(results.every(result => result.status === 200));
  assert.deepEqual(received.sort(), [
    'https://first.example/v1/chat/completions Bearer key-first',
    'https://second.example/v1/chat/completions Bearer key-second',
  ]);
});

test('WaveSpeed BYOK covers upload tickets, secret-free signed PUT and polling on the saved gateway', async () => {
  let tickets = 0;
  let puts = 0;
  let submissions = 0;
  let polls = 0;
  const plugin = ideogramPlugin('unused-default', async (url, init) => {
    const headers = new Headers(init?.headers);
    if (init?.method === 'PUT') {
      puts++;
      assert.equal(String(url), 'https://uploads.example/signed-file');
      assert.equal(headers.has('Authorization'), false);
      assert.equal(headers.has('X-MoMoFlow-Api-Key'), false);
      return new Response(null, { status: 200 });
    }
    assert.equal(headers.get('Authorization'), 'Bearer custom-wavespeed');
    assert.equal(String(url).startsWith('https://gateway.example/prefix/v1/'), true);
    if (String(url).endsWith('/media/uploads')) {
      tickets++;
      return Response.json({ data: { download_url: 'https://cdn.example/input.png', upload: { method: 'PUT', url: 'https://uploads.example/signed-file', headers: {} } } });
    }
    if (String(url).includes('/predictions/')) {
      polls++;
      assert.equal(String(url), 'https://gateway.example/prefix/v1/predictions/pred_byok/result');
      return Response.json({ data: { id: 'pred_byok', status: 'completed', outputs: ['https://cdn.example/result.png'] } });
    }
    submissions++;
    return Response.json({ data: { id: 'pred_byok', status: 'created' } });
  }, async () => {});
  const result = await invoke(plugin, '/api/ideogram/edit', { prompt: 'edit', image: png, referenceImages: [] }, customHeaders('wavespeed'));
  assert.equal(result.status, 200);
  assert.deepEqual([tickets, puts, submissions, polls], [1, 1, 1, 1]);
  assert.equal(JSON.stringify(result).includes('custom-wavespeed'), false);
});
