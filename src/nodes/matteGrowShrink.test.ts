import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import { matteGrowShrinkRevision, defaultMatteGrowShrinkSettings, restoreMatteGrowShrinkData } from './matteGrowShrink.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { previewImages } from './preview.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { restoreCompareData } from './compare.ts';
import type { AppNode, MatteGrowShrinkNode, FileAsset } from './types';

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 1200, height: 800 });
const file: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const color: MatteGrowShrinkNode = { id: 'color', type: 'matte-grow-shrink', position: { x: 0, y: 0 },
  data: { settings: { ...defaultMatteGrowShrinkSettings }, result: { ...asset('result'), maskMode: 'luminance' }, outputRevision: matteGrowShrinkRevision({ settings: defaultMatteGrowShrinkSettings }, 'input') } };
const input = { id: 'in', source: 'image', sourceHandle: 'file', target: 'color', targetHandle: 'image' };
test('downstream output invalidates on changes, disconnection and upstream replacement, including chains', () => {
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  const output = { id: 'out', source: 'color', sourceHandle: 'result', target: 'preview', targetHandle: 'file' };
  assert.deepEqual(previewImages('preview', [file, color, preview], [input, output]), [color.data.result]);
  assert.deepEqual(previewImages('preview', [file, color, preview], [output]), []);
  assert.deepEqual(imageOutput(color, 'invalid', [file, color], [input]), []);
  const second: MatteGrowShrinkNode = { ...color, id: 'second', data: { ...color.data, result: asset('second'), outputRevision: matteGrowShrinkRevision(color.data, 'result') } };
  const edges = [input, { id: 'chain', source: 'color', sourceHandle: 'result', target: 'second', targetHandle: 'image' }];
  assert.equal(imageOutput(second, 'result', [file, color, second], edges)[0].id, 'second');
  const changed: MatteGrowShrinkNode = { ...color, data: { ...color.data, settings: { ...color.data.settings, size: 75 } } };
  assert.deepEqual(imageOutput(second, 'result', [file, changed, second], edges), []);
  assert.deepEqual(imageOutput(color, 'result', [{ ...file, data: { assets: [asset('replacement')] } }, color], [input]), []);
  const generator: AppNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: 'test' } };
  const run = prepareSunburstRun([file, color, generator, prompt], [input, { id: 'p', source: 'p', target: 'g', targetHandle: 'prompt' },
    { ...output, target: 'g', targetHandle: 'image-0' }], ['g'], 1);
  assert.equal(run.error, undefined);
  assert.deepEqual(run.tasks[0].imageRequest?.images, ['blob:result']);
});
test('connections and recommendations support image tools and reject wrong types, handles, duplicate connections and cycles', () => {
  assert.equal(canConnect(input, [file, color], []), true);
  assert.equal(canConnect(input, [file, color], [input]), false);
  assert.equal(canConnect({ ...input, targetHandle: 'bad' }, [file, color], []), false);
  assert.equal(canConnect(input, [file, { ...color, data: { ...color.data, locked: true } }], []), false);
  assert.equal(canConnect(input, [{ ...file, type: 'text', data: { text: 'bad' } }, color], []), false);
  const second: MatteGrowShrinkNode = { ...color, id: 'second' };
  const connection = { ...input, source: 'second', sourceHandle: 'result' };
  assert.equal(canConnect(connection, [color, second], []), true);
  assert.equal(canConnect({ ...connection, sourceHandle: 'bad' }, [color, second], []), false);
  assert.equal(canConnect(connection, [color, second], [{ id: 'cycle', source: 'color', target: 'second' }]), false);
  const pending: PendingConnection = { nodeId: 'color', handleId: 'result', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, [color], []).some(item => item.itemId === 'preview'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'image', handleId: 'file' }, [file], []).some(item => item.itemId === 'matte-grow-shrink'));
  assert.ok(connectionChoices({ ...pending, direction: 'target', handleId: 'image' }, [color], []).some(item => item.itemId === 'crop'));
});
test('clipboard validation strips derived outputs; persistence maps and retains both images', () => {
  const detached: MatteGrowShrinkNode = { ...color, data: { ...color.data, baseImage: asset('input') } };
  assert.equal(imageOutput(detached, 'result', [detached], [])[0].id, 'result');
  const restored = restoreMatteGrowShrinkData(detached.data)!;
  assert.deepEqual(restored.settings, defaultMatteGrowShrinkSettings);
  assert.equal(restored.baseImage?.id, 'input'); assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined); assert.equal(restored.locked, false);
  for (const value of [NaN, Infinity, -101, 101, 1.5, '1']) assert.equal(restoreMatteGrowShrinkData({ settings: { ...defaultMatteGrowShrinkSettings, size: value } }), undefined);
  const [mapped] = mapAssets([detached], image => ({ ...image, url: `${image.url}-restored` }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});


import { matteGrowShrinkPixels } from './matteGrowShrink.ts';
import { outputKind } from './router.ts';
import { defaultPainterData, painterRevision } from './painter.ts';
const rgba = (values: number[]) => Uint8ClampedArray.from(values.flatMap(value => [value, value, value, 255]));
const gray = (pixels: Uint8ClampedArray) => [...pixels.filter((_, index) => index % 4 === 0)];
test('positive size grows white coverage, negative size shrinks it, and zero retains soft masks', () => {
  const pixels = rgba([0, 0, 80, 255, 80, 0, 0]);
  assert.deepEqual(gray(matteGrowShrinkPixels(pixels, 7, 1, { size: 1 })), [0, 80, 255, 255, 255, 80, 0]);
  assert.deepEqual(gray(matteGrowShrinkPixels(pixels, 7, 1, { size: -1 })), [0, 0, 0, 80, 0, 0, 0]);
  assert.deepEqual(matteGrowShrinkPixels(pixels, 7, 1, { size: 0 }), pixels);
  assert.deepEqual(gray(matteGrowShrinkPixels(rgba([0, 255, 0]), 3, 1, { size: -1 })), [0, 0, 0]);
  assert.deepEqual(gray(matteGrowShrinkPixels(rgba([255, 0, 255]), 3, 1, { size: 1 })), [255, 255, 255]);
});
test('two-pass extrema agree with an independent 2D reference at edges and scaled radius', () => {
  for (const [width, height] of [[9, 7], [1, 9], [11, 1], [1, 1]]) {
    const values = Array.from({ length: width * height }, (_, i) => (i * 71 + 19) % 256);
    const pixels = rgba(values), saved = pixels.slice();
    for (const size of [-100, -3, -1, 0, 1, 4, 100]) for (const scale of [1, .4]) {
      const expected: number[] = [], radius = Math.round(Math.abs(size) * scale);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let value = values[y * width + x];
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const sample = values[Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))];
          value = size > 0 ? Math.max(value, sample) : Math.min(value, sample);
        }
        expected.push(value);
      }
      assert.deepEqual(gray(matteGrowShrinkPixels(pixels, width, height, { size }, scale)), expected);
    }
    assert.deepEqual(pixels, saved);
  }
});
test('flat masks remain flat; transparent hidden colors cannot grow into the mask', () => {
  for (const value of [0, 127, 255]) for (const size of [-100, 100]) {
    const pixels = rgba(Array(35).fill(value));
    assert.deepEqual(matteGrowShrinkPixels(pixels, 7, 5, { size }), pixels);
  }
  const pixels = Uint8ClampedArray.from([255, 255, 255, 0, 255, 255, 255, 128, 0, 0, 0, 255]);
  assert.deepEqual(matteGrowShrinkPixels(pixels, 3, 1, { size: 0 }), rgba([0, 128, 0]));
  assert.deepEqual(matteGrowShrinkPixels(pixels, 3, 1, { size: 1 }), rgba([128, 128, 128]));
  for (const size of [NaN, Infinity, -101, 101]) assert.throws(() => matteGrowShrinkPixels(pixels, 3, 1, { size }));
});
test('Painter Mask connects, Router keeps the mask type and Sunburst uses luminance semantics', () => {
  const painter: AppNode = { id: 'paint', type: 'painter', position: { x: 0, y: 0 }, data: {
    ...defaultPainterData, strokes: [], mask: asset('paint-mask'), outputRevision: painterRevision(defaultPainterData),
  } };
  assert.equal(canConnect({ ...input, source: 'paint', sourceHandle: 'mask' }, [painter, color], []), true);
  const router: AppNode = { id: 'r', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const routing = { id: 'route', source: color.id, sourceHandle: 'result', target: 'r', targetHandle: 'input' };
  assert.equal(outputKind(color, 'result'), 'mask');
  assert.equal(outputKind(router, 'output', [color, router], [routing]), 'mask');
  const generator: AppNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: 'test' } };
  const nodes = [file, color, router, generator, prompt];
  const edges = [input, routing, { id: 'p', source: 'p', target: 'g', targetHandle: 'prompt' },
    { id: 'ref', source: 'image', sourceHandle: 'file', target: 'g', targetHandle: 'image-0' },
    { id: 'mask', source: 'r', sourceHandle: 'output', target: 'g', targetHandle: 'mask' }];
  assert.equal(canConnect(edges[4], nodes, edges.slice(0, 4)), true);
  const run = prepareSunburstRun(nodes, edges, ['g'], 1);
  assert.equal(run.error, undefined);
  assert.equal(run.tasks[0].imageRequest?.maskMode, 'luminance');
  assert.equal(run.tasks[0].imageRequest?.mask, 'blob:result');
  const pending: PendingConnection = { nodeId: color.id, handleId: 'result', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, nodes, edges).some(item => item.itemId === 'sunburst' && item.handleId === 'mask'));
});

test('both Compare outputs preserve Matte semantics through nested Compare and Router chains', () => {
  const compare: AppNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { mode: 'slider', split: .5 } };
  const next: AppNode = { ...compare, id: 'next' };
  const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const generator: AppNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: 'test' } };
  const nodes: AppNode[] = [file, color, compare, next, router, generator, prompt];
  for (const port of [1, 2]) {
    const edges: Edge[] = [input,
      { id: 'matte', source: color.id, sourceHandle: 'result', target: compare.id, targetHandle: `input-${port}` },
      { id: 'plain', source: file.id, sourceHandle: 'file', target: compare.id, targetHandle: `input-${3 - port}` },
      { id: 'route', source: compare.id, sourceHandle: `output-${port}`, target: router.id, targetHandle: 'input' },
      { id: 'next', source: router.id, sourceHandle: 'output', target: next.id, targetHandle: 'input-2' },
      { id: 'prompt', source: prompt.id, target: generator.id, targetHandle: 'prompt' },
      { id: 'image', source: file.id, sourceHandle: 'file', target: generator.id, targetHandle: 'image-0' },
      { id: 'mask', source: next.id, sourceHandle: 'output-2', target: generator.id, targetHandle: 'mask' },
    ];
    assert.ok(canConnect(edges[7], nodes, edges.slice(0, 7)));
    const run = prepareSunburstRun(nodes, edges, ['g'], 1);
    assert.equal(run.error, undefined);
    assert.equal(run.tasks[0].imageRequest?.mask, 'blob:result');
    assert.equal(run.tasks[0].imageRequest?.maskMode, 'luminance');
    assert.equal(imageOutput(compare, `output-${3 - port}`, nodes, edges)[0].maskMode, undefined);
    const replaced: Edge[] = edges.map((edge): Edge => edge.id === 'matte' ? { ...edge, source: file.id, sourceHandle: 'file' } : edge);
    assert.equal(prepareSunburstRun(nodes, replaced, ['g'], 1).tasks[0].imageRequest?.maskMode, undefined);
    assert.ok(prepareSunburstRun(nodes, edges.filter(edge => edge.id !== 'matte'), ['g'], 1).error);
    const changed: MatteGrowShrinkNode = { ...color, data: { ...color.data, settings: { size: 1 } } };
    assert.ok(prepareSunburstRun(nodes.map(node => node.id === color.id ? changed : node), edges, ['g'], 1).error);
  }
});

test('legacy Matte outputs and detached Compare snapshots retain mask metadata after restoration', () => {
  const legacy = { ...color, data: { ...color.data, result: asset('result') } };
  const mask = imageOutput(legacy, 'result', [file, legacy], [input])[0];
  assert.equal(mask.maskMode, 'luminance');
  assert.equal(legacy.data.result.maskMode, undefined);
  const restored = restoreCompareData({ mode: 'toggle', split: .5, input1: mask, input2: asset('plain') })!;
  const compare: AppNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: restored };
  const [mapped] = mapAssets([compare], image => ({ ...image, url: `${image.url}-restored` }));
  assert.equal(imageOutput(mapped, 'output-1', [mapped], [])[0].maskMode, 'luminance');
  assert.equal(imageOutput(mapped, 'output-2', [mapped], [])[0].maskMode, undefined);
  assert.equal(imageOutput(mapped, 'output-1', [mapped], [])[0].url, 'blob:result-restored');
});
