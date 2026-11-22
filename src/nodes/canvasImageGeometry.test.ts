import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasImageSize } from './canvasImageGeometry.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultSeedreamSettings } from './seedream.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';

test('empty Image nodes size to the requested aspect ratio with a square automatic fallback', () => {
  assert.deepEqual(canvasImageSize('16:9'), { width: 683, height: 384 });
  assert.deepEqual(canvasImageSize('2:3'), { width: 384, height: 576 });
  assert.deepEqual(canvasImageSize('auto'), { width: 384, height: 384 });
});

test('result dimensions take precedence over the next generation ratio', () => {
  assert.deepEqual(canvasImageSize('9:16', { width: 1536, height: 1024 }), { width: 576, height: 384 });
  assert.deepEqual(canvasImageSize('9:16', { width: 0, height: 1024 }), { width: 384, height: 384 });
});

test('automatic empty nodes use the reference dimensions while explicit ratios and results take precedence', () => {
  const reference = { width: 720, height: 960 };
  assert.deepEqual(canvasImageSize('auto', undefined, reference), { width: 384, height: 512 });
  assert.deepEqual(canvasImageSize('auto', undefined, { width: 720 }), { width: 384, height: 384 });
  assert.deepEqual(canvasImageSize('16:9', undefined, reference), { width: 683, height: 384 });
  assert.deepEqual(canvasImageSize('auto', { width: 1536, height: 1024 }, reference), { width: 576, height: 384 });
});

test('regeneration previews use the submitted ratio until a result is available or the task ends', () => {
  const previous = { width: 1024, height: 1024 };
  const generation = { imageRequest: { ...defaultSunburstSettings, size: '21:9', prompt: 'panorama', images: [] } };
  // Changing the next-run controls alone leaves the previous result square.
  assert.deepEqual(canvasImageSize('21:9', previous), { width: 384, height: 384 });
  assert.deepEqual(canvasImageSize('21:9', previous, undefined, generation), { width: 896, height: 384 });
  assert.deepEqual(canvasImageSize('9:16', previous, undefined, generation), { width: 896, height: 384 });
  // Historical previews, cancellation and failure no longer pass a pending task.
  assert.deepEqual(canvasImageSize('21:9', previous), { width: 384, height: 384 });
  assert.deepEqual(canvasImageSize('21:9', { width: 2100, height: 900 }), { width: 896, height: 384 });
});

test('generation previews handle all image request formats and automatic reference sizing', () => {
  const previous = { width: 1024, height: 1024 };
  const reference = { width: 720, height: 960 };
  const common = { prompt: 'panorama', images: [] };
  assert.deepEqual(canvasImageSize('1:1', previous, undefined, {
    imageRequest: { ...defaultSunburstSettings, ...common, size: '2304x1024' },
  }), { width: 864, height: 384 });
  assert.deepEqual(canvasImageSize('1:1', previous, undefined, {
    seedreamRequest: { ...defaultSeedreamSettings, ...common, size: '21:9' },
  }), { width: 896, height: 384 });
  assert.deepEqual(canvasImageSize('1:1', previous, undefined, {
    nanoBananaRequest: { ...defaultNanoBananaSettings, ...common, aspectRatio: '9:16' },
  }), { width: 384, height: 683 });
  assert.deepEqual(canvasImageSize('1:1', previous, reference, {
    seedreamRequest: { ...defaultSeedreamSettings, ...common, size: 'auto' },
  }), { width: 384, height: 512 });
});
