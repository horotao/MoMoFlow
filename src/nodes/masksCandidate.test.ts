import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheMaskCandidate } from './masksCandidate.ts';
import type { MaskBitmap } from './masksExtractor';
import type { MaskPredictor } from './masksInference';
import type { FileAsset } from './types';

const source: FileAsset = { id: 'image', kind: 'image', name: 'test.png', url: 'blob:image' };
const point = { x: .3, y: .6 };
const bitmap: MaskBitmap = { width: 2, height: 1, pixels: new Uint8Array([1, 0]) };
const options = (controller = new AbortController()) => ({ signal: controller.signal, onProgress: () => {} });

test('a click adopts a completed hover result without another inference', async () => {
  let calls = 0;
  const predict = cacheMaskCandidate(async () => { calls++; return bitmap; });
  assert.equal(await predict(source, point, options()), bitmap);
  assert.equal(await predict(source, { ...point }, options()), bitmap);
  assert.equal(calls, 1);
});

test('a click adopts in-flight hover work even as the hover subscriber aborts', async () => {
  let calls = 0, gpuSignal: AbortSignal | undefined, complete!: (value: MaskBitmap) => void;
  const backend: MaskPredictor = (_source, _point, request) => {
    calls++; gpuSignal = request.signal;
    return new Promise(resolve => { complete = resolve; });
  };
  const predict = cacheMaskCandidate(backend), hover = new AbortController();
  const pending = predict(source, point, options(hover));
  const cancelled = assert.rejects(pending, { name: 'AbortError' });
  await Promise.resolve();
  hover.abort();
  const click = predict(source, point, options());
  await Promise.resolve();
  assert.equal(gpuSignal?.aborted, false);
  complete(bitmap);
  await cancelled;
  assert.equal(await click, bitmap);
  assert.equal(calls, 1);
});

test('different points, sources, URLs and explicit recalculation invalidate the candidate', async () => {
  let calls = 0;
  const predict = cacheMaskCandidate(async () => { calls++; return bitmap; });
  await predict(source, point, options());
  await predict(source, { ...point, x: .31 }, options());
  await predict({ ...source, id: 'replacement' }, point, options());
  await predict({ ...source, url: 'blob:replacement' }, point, options());
  await predict({ ...source, url: 'blob:replacement' }, point, { ...options(), recalculate: true });
  assert.equal(calls, 5);
});

test('cancelled GPU work and failed predictions are retried instead of cached', async () => {
  let calls = 0, cancelled = false;
  const predict = cacheMaskCandidate((_source, _point, request) => {
    calls++;
    if (calls === 1) return new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => { cancelled = true; reject(new DOMException('Cancelled', 'AbortError')); });
    });
    if (calls === 2) return Promise.reject(new Error('Network error'));
    return Promise.resolve(bitmap);
  });
  const controller = new AbortController(), first = predict(source, point, options(controller));
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await Promise.resolve(); controller.abort(); await rejected;
  assert.equal(cancelled, true);
  await assert.rejects(predict(source, point, options()), /Network error/);
  assert.equal(await predict(source, point, options()), bitmap);
  assert.equal(calls, 3);
});
