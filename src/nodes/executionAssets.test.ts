import test from 'node:test';
import assert from 'node:assert/strict';
import { readExecutionAsset, executionAssetTimeoutMs } from './executionAssets.ts';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

for (const phase of ['headers', 'body', 'hash'] as const) test(`asset deadline bounds stalled ${phase} and ignores late completion`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  let finish!: () => void;
  const deferred = new Promise<void>(resolve => { finish = resolve; });
  const blob = new Blob(['pixels']);
  if (phase === 'hash') t.mock.method(blob, 'arrayBuffer', async () => { await deferred; return new ArrayBuffer(4); });
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    signal = init.signal ?? undefined;
    if (phase === 'headers') await deferred;
    return { ok: true, blob: async () => { if (phase === 'body') await deferred; return blob; } } as Response;
  });
  const work = readExecutionAsset('https://example.invalid/image.png', new AbortController().signal, true);
  const rejected = assert.rejects(work, /读取图片超时/);
  await flush(); t.mock.timers.tick(executionAssetTimeoutMs); await rejected;
  assert.equal(signal?.aborted, true);
  finish(); await flush();
});

test('asset success clears deadline and computes stable hash; parent cancellation ends stalled reading', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => { signal = init.signal ?? undefined; return new Response('pixels'); });
  const parent = new AbortController();
  const result = await readExecutionAsset('blob:valid', parent.signal, true);
  assert.equal(result.blob.size, 6); assert.match(result.contentHash!, /^[a-f0-9]{64}$/);
  t.mock.timers.tick(executionAssetTimeoutMs); parent.abort('after success');
  assert.equal(signal?.aborted, false);
  t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => { signal = init.signal ?? undefined; return new Promise<Response>(() => {}); });
  const cancelled = new AbortController();
  const rejected = assert.rejects(readExecutionAsset('blob:stall', cancelled.signal), /user cancelled/);
  cancelled.abort('user cancelled'); await rejected;
  assert.equal(signal?.aborted, true);
});
