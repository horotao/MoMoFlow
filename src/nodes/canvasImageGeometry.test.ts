import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasImageSize } from './canvasImageGeometry.ts';

test('empty Image nodes size to the requested aspect ratio with a square automatic fallback', () => {
  assert.deepEqual(canvasImageSize('16:9'), { width: 683, height: 384 });
  assert.deepEqual(canvasImageSize('2:3'), { width: 384, height: 576 });
  assert.deepEqual(canvasImageSize('auto'), { width: 384, height: 384 });
});

test('result dimensions take precedence over the next generation ratio', () => {
  assert.deepEqual(canvasImageSize('9:16', { width: 1536, height: 1024 }), { width: 576, height: 384 });
  assert.deepEqual(canvasImageSize('9:16', { width: 0, height: 1024 }), { width: 384, height: 384 });
});
