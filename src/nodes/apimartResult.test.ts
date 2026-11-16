import test from 'node:test';
import assert from 'node:assert/strict';
import { apimartResultUrl, downloadApimartResult } from './apimartResult.ts';

const result = { imageUrl: 'https://cdn.example/result.png?signature=test', format: 'png' };

test('APIMart downloads results larger than the function response limit directly without credentials', async t => {
  const bytes = new Uint8Array(5 * 1024 * 1024).fill(42);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    calls++; assert.equal(url, result.imageUrl);
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.headers, undefined);
    assert.equal(init?.redirect, 'error'); assert.equal(init?.referrerPolicy, 'no-referrer');
    return new Response(bytes, { headers: { 'content-type': 'image/png' } });
  });
  const blob = await downloadApimartResult(result, 'png', new AbortController().signal);
  assert.equal(calls, 1); assert.equal(blob.size, bytes.length);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test('APIMart rejects invalid result locations and mismatched declared format before downloading', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Must not fetch'));
  for (const url of ['data:image/png;base64,eA==', 'http://cdn.example/a', 'https://user:pass@cdn.example/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://localhost./a', 'https://host.local/a']) {
    assert.throws(() => apimartResultUrl(url));
  }
  await assert.rejects(downloadApimartResult(result, 'jpeg', new AbortController().signal), /格式/);
});

test('APIMart checks MIME, empty data, HTTP errors and both declared and streamed size', async t => {
  for (const response of [
    new Response('expired', { status: 403 }),
    new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('', { headers: { 'content-type': 'image/png' } }),
    new Response('x', { headers: { 'content-type': 'image/png', 'content-length': String(33 * 1024 * 1024) } }),
    new Response(new Uint8Array(32 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(downloadApimartResult(result, 'png', new AbortController().signal));
    mock.mock.restore();
  }
});

test('APIMart reports CORS or network failure without falling back through the API', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new TypeError('Failed to fetch'); });
  await assert.rejects(downloadApimartResult(result, 'png', new AbortController().signal), /跨域.*不会重新生成/);
  assert.equal(calls, 1);
});

test('cancelling an APIMart download aborts its fetch and preserves cancellation', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    assert.ok(signal);
    return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const pending = downloadApimartResult(result, 'png', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
