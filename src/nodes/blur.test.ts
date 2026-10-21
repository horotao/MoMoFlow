import test from 'node:test';
import assert from 'node:assert/strict';
import { blurPixels, blurRevision, defaultBlurSettings, restoreBlurData } from './blur.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { previewImages } from './preview.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { AppNode, BlurNode, FileAsset } from './types';

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 1200, height: 800 });
const file: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const color: BlurNode = { id: 'color', type: 'blur', position: { x: 0, y: 0 },
  data: { settings: { ...defaultBlurSettings }, result: asset('result'), outputRevision: blurRevision({ settings: defaultBlurSettings }, 'input') } };
const input = { id: 'in', source: 'image', sourceHandle: 'file', target: 'color', targetHandle: 'image' };
test('downstream output invalidates on changes, disconnection and upstream replacement, including chains', () => {
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  const output = { id: 'out', source: 'color', sourceHandle: 'result', target: 'preview', targetHandle: 'file' };
  assert.deepEqual(previewImages('preview', [file, color, preview], [input, output]), [color.data.result]);
  assert.deepEqual(previewImages('preview', [file, color, preview], [output]), []);
  assert.deepEqual(imageOutput(color, 'invalid', [file, color], [input]), []);
  const second: BlurNode = { ...color, id: 'second', data: { ...color.data, result: asset('second'), outputRevision: blurRevision(color.data, 'result') } };
  const edges = [input, { id: 'chain', source: 'color', sourceHandle: 'result', target: 'second', targetHandle: 'image' }];
  assert.equal(imageOutput(second, 'result', [file, color, second], edges)[0].id, 'second');
  const changed: BlurNode = { ...color, data: { ...color.data, settings: { ...color.data.settings, size: 75 } } };
  assert.deepEqual(imageOutput(second, 'result', [file, changed, second], edges), []);
  assert.deepEqual(imageOutput(color, 'result', [{ ...file, data: { assets: [asset('replacement')] } }, color], [input]), []);
  const generator: AppNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: 'test' } };
  const run = prepareSunburstRun([file, color, generator, prompt], [input, { id: 'p', source: 'p', target: 'g', targetHandle: 'prompt' },
    { ...output, target: 'g', targetHandle: 'image-0' }], ['g'], 1);
  assert.equal(run.error, undefined);
  assert.deepEqual(run.tasks[0].imageRequest?.images, ['blob:result']);
});
test('connections and recommendations support image tools and reject wrong types, handles, occupied inputs and cycles', () => {
  assert.equal(canConnect(input, [file, color], []), true);
  assert.equal(canConnect(input, [file, color], [input]), false);
  assert.equal(canConnect({ ...input, targetHandle: 'bad' }, [file, color], []), false);
  assert.equal(canConnect(input, [file, { ...color, data: { ...color.data, locked: true } }], []), false);
  assert.equal(canConnect(input, [{ ...file, type: 'text', data: { text: 'bad' } }, color], []), false);
  const second: BlurNode = { ...color, id: 'second' };
  const connection = { ...input, source: 'second', sourceHandle: 'result' };
  assert.equal(canConnect(connection, [color, second], []), true);
  assert.equal(canConnect({ ...connection, sourceHandle: 'bad' }, [color, second], []), false);
  assert.equal(canConnect(connection, [color, second], [{ id: 'cycle', source: 'color', target: 'second' }]), false);
  const pending: PendingConnection = { nodeId: 'color', handleId: 'result', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, [color], []).some(item => item.itemId === 'preview'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'image', handleId: 'file' }, [file], []).some(item => item.itemId === 'blur'));
  assert.ok(connectionChoices({ ...pending, direction: 'target', handleId: 'image' }, [color], []).some(item => item.itemId === 'crop'));
});
test('clipboard validation strips derived outputs; persistence maps and retains both images', () => {
  const detached: BlurNode = { ...color, data: { ...color.data, baseImage: asset('input') } };
  assert.equal(imageOutput(detached, 'result', [detached], [])[0].id, 'result');
  const restored = restoreBlurData(detached.data)!;
  assert.deepEqual(restored.settings, defaultBlurSettings);
  assert.equal(restored.baseImage?.id, 'input'); assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined); assert.equal(restored.locked, false);
  for (const value of [NaN, Infinity, 0, 101, 1.5, '1']) assert.equal(restoreBlurData({ settings: { ...defaultBlurSettings, size: value } }), undefined);
  const [mapped] = mapAssets([detached], image => ({ ...image, url: `${image.url}-restored` }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});

test('size one is lossless; both kernels preserve flat fields including single-pixel images', () => {
  for (const type of ['box', 'gaussian'] as const) {
    const original = Uint8ClampedArray.from([23, 72, 199, 128, 255, 0, 0, 0]);
    assert.deepEqual(blurPixels(original, 2, 1, { type, size: 1 }), original);
    for (const [width, height] of [[1, 1], [1, 9], [13, 1], [7, 9]]) {
      const flat = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => [23, 72, 199, 128][i % 4]);
      assert.deepEqual(blurPixels(flat, width, height, { type, size: 100 }), flat);
    }
  }
});
test('box matches a naive clamped two-dimensional average and never mutates input', () => {
  const width = 7, height = 5, radius = 2;
  const pixels = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 37) % 256);
  const saved = pixels.slice(), expected = pixels.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      sum += pixels[(Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))) * 4 + c];
    }
    expected[(y * width + x) * 4 + c] = sum / 25;
  }
  assert.deepEqual(blurPixels(pixels, width, height, { type: 'box', size: 5 }), expected);
  assert.deepEqual(pixels, saved);
});
test('Gaussian has a symmetric bell profile distinct from Box; increasing size spreads the impulse', () => {
  const pixels = new Uint8ClampedArray(101 * 4);
  for (let i = 0; i < 101; i++) pixels[i * 4 + 3] = 255;
  pixels[50 * 4] = 255;
  const gaussian = blurPixels(pixels, 101, 1, { type: 'gaussian', size: 16 });
  const box = blurPixels(pixels, 101, 1, { type: 'box', size: 16 });
  assert.notDeepEqual(gaussian, box);
  assert.ok(gaussian[50 * 4] > gaussian[55 * 4]);
  for (let d = 0; d < 30; d++) assert.equal(gaussian[(50 - d) * 4], gaussian[(50 + d) * 4]);
  assert.ok(blurPixels(pixels, 101, 1, { type: 'gaussian', size: 40 })[50 * 4] < gaussian[50 * 4]);
});
test('transparent hidden blue never contaminates visible red and alpha is blurred', () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0]);
  for (const type of ['box', 'gaussian'] as const) {
    const result = blurPixels(pixels, 3, 1, { type, size: 5 });
    for (let i = 0; i < result.length; i += 4) if (result[i + 3]) {
      assert.equal(result[i], 255); assert.equal(result[i + 2], 0);
    }
    assert.ok(result[7] > 0 && result[7] < 255);
  }
});

// Independent direct 2D convolution, intentionally not the separable production path.
function referenceGaussian(pixels: Uint8ClampedArray, width: number, height: number, sigma: number) {
  const radius = Math.ceil(sigma * 4), weights: { dx: number; dy: number; weight: number }[] = [];
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    weights.push({ dx, dy, weight }); total += weight;
  }
  const result = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sums = [0, 0, 0, 0];
    for (const { dx, dy, weight } of weights) {
      const i = (Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))) * 4;
      const alpha = pixels[i + 3];
      for (let c = 0; c < 3; c++) sums[c] += pixels[i + c] * alpha / 255 * weight;
      sums[3] += alpha * weight;
    }
    const index = (y * width + x) * 4;
    result[index + 3] = sums[3] / total;
    if (sums[3]) for (let c = 0; c < 3; c++) result[index + c] = sums[c] * 255 / sums[3];
  }
  return result;
}

test('Gaussian matches direct 2D Gaussian weights, including alpha, edges and scaled previews', () => {
  for (const [width, height] of [[7, 5], [1, 7], [6, 1]]) {
    const input = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 73 + 29) % 256);
    const original = input.slice();
    for (const [size, scale] of [[2, 1], [8, 1], [25, .4], [100, 1]]) {
      const actual = blurPixels(input, width, height, { type: 'gaussian', size }, scale);
      const expected = referenceGaussian(input, width, height, (size - 1) * scale / 3);
      for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= 1, `size ${size}, byte ${i}: ${actual[i]} vs ${expected[i]}`);
    }
    assert.deepEqual(input, original);
  }
});

test('Size 2 produces a real Gaussian response instead of the previous identity approximation', () => {
  const input = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  const result = blurPixels(input, 3, 1, { type: 'gaussian', size: 2 });
  assert.ok(result[0] > 0);
  assert.ok(result[4] < 255);
  assert.equal(result[0], result[8]);
});

test('old approximate Gaussian outputs invalidate, while Box revisions remain compatible', () => {
  const old: BlurNode = { ...color, data: { ...color.data, outputRevision: JSON.stringify(['input', 'gaussian', 50]) } };
  assert.deepEqual(imageOutput(old, 'result', [file, old], [input]), []);
  assert.equal(blurRevision({ settings: { type: 'box', size: 50 } }, 'input'), JSON.stringify(['input', 'box', 50]));
});
