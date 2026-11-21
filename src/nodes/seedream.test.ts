import test from 'node:test';
import assert from 'node:assert/strict';
import { isCanvasImageNode } from './types.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, SeedreamNode } from './types';
import { defaultSeedreamSettings, normalizeSeedreamSize, seedreamAspectRatios, seedreamModel, seedreamPreviewAspectRatio, seedreamSizeLimits, validateSeedreamSettings, validateSeedreamSize } from './seedream.ts';
import { prepareSeedreamRun } from './seedreamRun.ts';
import { imageOutput } from './sunburstRun.ts';
import { extractFileAsset } from './fileCollection.ts';
import { nodeAssetUrls, taskAssetUrls } from './assetResources.ts';
import { mapAssets, workflowSnapshot } from '../persistence/workflowStorage.ts';
import { restoreSeedreamData } from './seedreamClipboard.ts';
import { prepareModel } from './executionGraph.ts';

const asset: FileAsset = { id: 'a', name: 'a.png', kind: 'image', url: 'blob:a', width: 16, height: 9 };
const seedream: SeedreamNode = { id: 'seedream', type: 'seedream', position: { x: 0, y: 0 }, data: { ...defaultSeedreamSettings, imageInputs: 2 } };
const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Make a landscape' } };
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset] } };
const nodes = [seedream, prompt, file];
const edges: Edge[] = [{ id: 'p', source: prompt.id, target: seedream.id, targetHandle: 'prompt' }];
const imageEdge: Edge = { id: 'i', source: file.id, sourceHandle: 'file', target: seedream.id, targetHandle: 'image-0' };

test('Seedream size accepts exactly the requested ratios and bounded positive integer pixels, without 16px alignment', () => {
  assert.deepEqual(seedreamAspectRatios, ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9', '2:1', '1:2']);
  for (const ratio of seedreamAspectRatios) assert.equal(validateSeedreamSize(ratio), ratio);
  for (const size of ['1536x600', '1537x1001', '5377x860', '3840x240', '240x3840']) assert.equal(validateSeedreamSize(size), size);
  for (const size of ['16:10', '9:21', '1K', 'custom', '', '0x2048', '-1536x1536', '1536.5x1000', '1536x', '1536x599', '5377x861', '4000x240', '240x4000']) {
    assert.throws(() => validateSeedreamSize(size), Error, size);
  }
  assert.equal(seedreamPreviewAspectRatio('16:9'), '16 / 9');
  assert.equal(seedreamPreviewAspectRatio('1537x1001'), '1537 / 1001');
  assert.equal(seedreamPreviewAspectRatio('auto'), null);
  assert.equal(seedreamPreviewAspectRatio('512x512'), null);
});

test('exact pixel normalization preserves valid sizes and fits undersized, oversized and extreme shapes', () => {
  assert.equal(normalizeSeedreamSize('1537', '1001'), '1537x1001');
  assert.equal(normalizeSeedreamSize('512', '512'), '960x960');
  assert.equal(normalizeSeedreamSize('8192', '8192'), '2150x2150');
  assert.equal(normalizeSeedreamSize('10000', '100'), '4000x250');
  assert.equal(normalizeSeedreamSize('100', '10000'), '250x4000');
  assert.equal(normalizeSeedreamSize('1000.4', '1000.7'), '1000x1001');
  assert.equal(normalizeSeedreamSize('', '0', '1537x1001'), '1537x1001');
  assert.equal(normalizeSeedreamSize(NaN, -100, 'invalid'), '1536x1536');
  assert.equal(normalizeSeedreamSize(1e300, 1e300), '2150x2150');
  assert.equal(normalizeSeedreamSize('5377', '860'), '5377x860');
});

test('normalized integer sizes remain within every API boundary and are stable when normalized again', () => {
  let seed = 37;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const pairs = [[1e300, 1], [1, 1e300], [1e300, 1e250], [1e250, 1e300], [1, 1], [3840, 240], [240, 3840]];
  for (let index = 0; index < 500; index++) pairs.push([1 + next() % 100000, 1 + next() % 100000]);
  for (const [width, height] of pairs) {
    const size = normalizeSeedreamSize(width, height);
    assert.equal(validateSeedreamSize(size), size);
    const [w, h] = size.split('x').map(Number);
    assert.equal(normalizeSeedreamSize(w, h), size);
    const requestedRatio = Math.min(seedreamSizeLimits.maxAspectRatio, Math.max(1 / seedreamSizeLimits.maxAspectRatio, width / height));
    assert.ok(Math.abs(Math.log((w / h) / requestedRatio)) < .01, `${width}x${height} → ${size}`);
  }
});

test('legacy Seedream data keeps automatic sizing and 1.5K through execution and clipboard restore', () => {
  const legacy = { ...seedream.data } as Record<string, unknown>; delete legacy.size;
  assert.equal(validateSeedreamSettings(legacy).size, 'auto');
  assert.equal(restoreSeedreamData(legacy)?.size, 'auto');
  const node = { ...seedream, data: legacy } as SeedreamNode;
  assert.equal(prepareModel({ nodes: [node, prompt], edges }, node.id)[0].seedreamRequest?.size, 'auto');
});

test('runs snapshot exact model, prompt, sorted references and local parameters', () => {
  const second: AppNode = { ...file, id: 'second', data: { assets: [{ ...asset, id: 'b', url: 'blob:b' }] } };
  const configured: SeedreamNode = { ...seedream, data: { ...seedream.data, resolution: '2K' } };
  const result = prepareSeedreamRun([configured, prompt, file, second], [...edges,
    { ...imageEdge, id: 'second', source: second.id, targetHandle: 'image-1' }, imageEdge,
  ], [seedream.id, seedream.id], 2);
  assert.equal(result.error, undefined); assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].model, seedreamModel);
  assert.deepEqual(result.tasks[0].seedreamRequest, { ...defaultSeedreamSettings, resolution: '2K', prompt: prompt.data.text, images: ['blob:a', 'blob:b'] });
  assert.deepEqual(taskAssetUrls(result.tasks[0]), ['blob:a', 'blob:b']);
  assert.equal(result.tasks[0].batchId, result.tasks[1].batchId);
  assert.notEqual(result.tasks[0].id, result.tasks[1].id);
  assert.deepEqual(prepareSeedreamRun(nodes, edges, [seedream.id], 1).tasks[0].seedreamRequest?.images, []);
});

test('invalid or missing input blocks the whole batch, locked nodes do not submit', () => {
  for (const runs of [0, 11, 1.5]) assert.ok(prepareSeedreamRun(nodes, edges, [seedream.id], runs).error);
  assert.ok(prepareSeedreamRun(nodes, [], [seedream.id], 1).error);
  assert.ok(prepareSeedreamRun([seedream, prompt], [...edges, imageEdge], [seedream.id], 1).error);
  const tooMany = { ...file, data: { assets: Array(11).fill(asset) } };
  assert.ok(prepareSeedreamRun([seedream, prompt, tooMany], [...edges, imageEdge], [seedream.id], 1).error);
  assert.equal(prepareSeedreamRun([{ ...seedream, data: { ...seedream.data, locked: true } }, prompt], edges, [seedream.id], 1).tasks.length, 0);
});

test('selected result, extraction, clipboard, asset ownership and persisted data remain consistent', () => {
  const second = { ...asset, id: 'b', url: 'blob:b' };
  const generated: SeedreamNode = { ...seedream, data: { ...seedream.data, label: 'My seedream', results: [asset, second], activeResultId: asset.id, exposed: ['resolution'] } };
  assert.deepEqual(imageOutput(generated, 'result'), [asset]);
  assert.deepEqual([...nodeAssetUrls([generated])], ['blob:a', 'blob:b']);
  const mapped = mapAssets([generated], item => ({ ...item, url: `blob:restored-${item.id}` }))[0] as SeedreamNode;
  assert.equal(mapped.data.results?.[0].url, 'blob:restored-a');
  const copy = restoreSeedreamData(generated.data)!;
  assert.equal(copy.label, 'My seedream'); assert.equal(copy.activeResultId, asset.id); assert.equal(copy.exposed, undefined);
  const extracted = extractFileAsset([generated], generated.id, asset.id, { x: 20, y: 30 }, 'new-file');
  assert.equal((extracted[0] as SeedreamNode).data.activeResultId, second.id);
  assert.deepEqual(imageOutput(extracted[1], 'file'), [asset]);
  const snapshot = workflowSnapshot({ nodes: [{ ...generated, selected: true }], edges: [], viewport: { x: 1, y: 2, zoom: .5 }, colorMode: 'dark' });
  const [saved] = snapshot.nodes;
  assert.ok(isCanvasImageNode(saved));
  assert.equal(saved.selected, undefined);
  assert.deepEqual(saved.data.results, [asset, second]);
  assert.equal(saved.data.activeResultId, asset.id);
  assert.equal(saved.data.composer.selection?.modelIds[0], 'seedream-5-5');
  assert.equal(saved.data.composer.modelSettings?.['seedream-5-5'].resolution, '1.5K');
});
