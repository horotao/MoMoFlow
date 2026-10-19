import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { buildDeepSeekRequest, deepseekPlugin } from './deepseek.ts';
const image = 'data:image/png;base64,aGVsbG8=';
test('vision payload preserves instructions and ordered images in user content only', () => {
  const body = buildDeepSeekRequest({ model: 'deepseek-flash', instructions: '使用中文', images: [image, image] });
  assert.deepEqual(body.messages[0], { role: 'system', content: '使用中文' });
  assert.equal(body.messages[1].role, 'user');
  assert.equal(body.messages[1].content.length, 3);
  assert.equal(body.model, 'deepseek-flash');
});
test('unsupported models, empty images, remote URLs and unsupported formats fail before submission', () => {
  for (const input of [
    { model: 'other', instructions: '', images: [image] },
    { model: 'deepseek-flash', instructions: '', images: [] },
    { model: 'deepseek-flash', instructions: '', images: ['http://localhost/private'] },
    { model: 'deepseek-flash', instructions: '', images: ['data:image/svg+xml;base64,aGVsbG8='] },
  ]) assert.throws(() => buildDeepSeekRequest(input));
});
test('local endpoint reports missing credentials and rejects cross-origin requests', async () => {
  let handler;
  const plugin = deepseekPlugin('');
  plugin.configureServer({ middlewares: { use(value) { handler = value; } } });
  const server = createServer((req, res) => handler(req, res, () => res.end()));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/describer`;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /DEEPSEEK_API_KEY/);
    assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

// Invoke the actual dev/preview middleware without opening ports or using real credentials.
async function invokeLocalApi(hook: 'configureServer' | 'configurePreviewServer', headers: Record<string, string>, encrypted = false) {
  const { Readable } = await import('node:stream');
  const { EventEmitter } = await import('node:events');
  let handler;
  const plugin = deepseekPlugin('test-only-key');
  plugin[hook]({ middlewares: { use(value) { handler = value; } } });
  const body = JSON.stringify({ model: 'deepseek-flash', instructions: '使用中文', images: [image] });
  const req = Object.assign(Readable.from([Buffer.from(body)]), {
    url: '/api/describer', method: 'POST', headers: { 'content-type': 'application/json', ...headers }, socket: { encrypted },
  });
  let status = 0;
  let result = '';
  const res = Object.assign(new EventEmitter(), {
    destroyed: false, writableEnded: false,
    writeHead(value: number) { status = value; },
    end(value: string) { result = value; this.writableEnded = true; },
  });
  await handler(req, res, () => assert.fail('API must not fall through'));
  return { status, body: JSON.parse(result) };
}

for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  test(`${hook} blocks rebinding, malformed hosts and mismatched origins before provider access`, async (t) => {
    const upstream = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Provider must not be called'); });
    for (const headers of [
      { host: 'untrusted.example:5173', origin: 'http://untrusted.example:5173' },
      { host: 'untrusted.example:5173' },
      { host: 'localhost.evil.example:5173', origin: 'http://localhost.evil.example:5173' },
      { host: 'localhost@evil.example:5173', origin: 'http://localhost@evil.example:5173' },
      { host: 'localhost:5173', origin: 'http://evil.example:5173' },
      { host: 'localhost:5173', origin: 'http://localhost:5174' },
      { host: 'localhost:5173', origin: 'https://localhost:5173' },
      { host: 'localhost:5173', origin: 'null' },
      { host: 'localhost:5173', origin: '' },
      { host: 'localhost:65536' },
      { host: 'localhost:0' },
      { origin: 'http://localhost:5173' },
      { host: 'evil.example', 'x-forwarded-host': 'localhost:5173', origin: 'http://localhost:5173' },
    ]) {
      assert.equal((await invokeLocalApi(hook, headers)).status, 403, JSON.stringify(headers));
    }
    assert.equal(upstream.mock.callCount(), 0);
  });
  test(`${hook} allows local same-origin and local CLI requests and preserves provider output`, async (t) => {
    const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-only-key');
      assert.equal(JSON.parse(options.body).model, 'deepseek-flash');
      return new Response(JSON.stringify({ choices: [{ message: { content: '测试图片提示词' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }));
    });
    for (const host of ['localhost:5173', '127.0.0.1:4173', '[::1]:5173']) {
      for (const encrypted of [false, true]) {
        const result = await invokeLocalApi(hook, { host, origin: `${encrypted ? 'https' : 'http'}://${host}` }, encrypted);
        assert.equal(result.status, 200);
        assert.equal(result.body.text, '测试图片提示词');
        assert.equal(result.body.usage.total_tokens, 10);
      }
    }
    assert.equal((await invokeLocalApi(hook, { host: 'localhost:5173' })).status, 200);
    assert.equal(upstream.mock.callCount(), 7);
  });
}
