import test from 'node:test';
import assert from 'node:assert/strict';
import { combineMasks, decodeMask, encodeMask, maskOperation, maskPoint, masksDocument, masksRevision, restoreMasksData } from './masksExtractor.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { outputKind } from './router.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, MasksExtractorNode } from './types';

const image: FileAsset = { id: 'image', name: 'input.png', kind: 'image', url: 'blob:input', width: 4, height: 2 };
const bitmap = { width: 4, height: 2, pixels: new Uint8Array([0, 1, 1, 0, 0, 1, 1, 0]) };
const selection = encodeMask(bitmap, image.id, 'selection-1');
const mask: MasksExtractorNode = { id: 'mask', type: 'masks-extractor', position: { x: 0, y: 0 }, data: { selection,
  result: { ...image, id: 'cutout', url: 'blob:cutout' }, mask: { ...image, id: 'bw', url: 'blob:bw' } } };
mask.data.outputRevision = masksRevision(mask.data, image.id);
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [image] } };
const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
const input: Edge = { id: 'input', source: 'file', sourceHandle: 'file', target: 'mask', targetHandle: 'image' };
const connect = (handle = 'mask') => ({ source: 'mask', sourceHandle: handle, target: 'preview', targetHandle: 'file' });

test('mask regions use union and subtraction rather than treating multiple objects as point refinements', () => {
  const second = { ...bitmap, pixels: new Uint8Array([0, 0, 1, 1, 0, 0, 1, 1]) };
  assert.deepEqual([...combineMasks(bitmap, second, 'add').pixels], [0, 1, 1, 1, 0, 1, 1, 1]);
  assert.deepEqual([...combineMasks(bitmap, second, 'subtract').pixels], [0, 1, 0, 0, 0, 1, 0, 0]);
  assert.deepEqual(combineMasks(bitmap, second, 'replace'), second);
  assert.equal(combineMasks(undefined, second, 'subtract').pixels.some(Boolean), false);
  assert.throws(() => combineMasks(bitmap, { ...second, width: 2 }, 'add'));
});

test('selection compression preserves all-zero/all-one/alternating masks and clipboard rejects malformed runs', () => {
  for (const pixels of [new Uint8Array(8), new Uint8Array(8).fill(1), bitmap.pixels, new Uint8Array([1, 0, 1, 0, 1, 0, 1, 0])]) {
    const selected = encodeMask({ ...bitmap, pixels }, 'image', 'id');
    assert.deepEqual(decodeMask(selected).pixels, pixels);
    assert.ok(restoreMasksData({ selection: selected }));
  }
  for (const invalid of [{ ...selection, width: 0 }, { ...selection, height: 2048 }, { ...selection, runs: [9] }, { ...selection, runs: [0, -1, 9] }, { ...selection, runs: [2, .5, 5.5] }, { ...selection, inputId: '' }]) {
    assert.equal(restoreMasksData({ selection: invalid }), undefined);
  }
  assert.equal(restoreMasksData({ baseImage: { ...image, kind: 'video' } }), undefined);
  const restored = restoreMasksData({ ...mask.data, baseImage: image, locked: true })!;
  assert.equal(restored.locked, false); assert.equal(restored.result, undefined); assert.equal(restored.outputRevision, undefined);
  assert.deepEqual(restored.selection, selection); assert.notEqual(restored.selection?.runs, selection.runs);
  assert.deepEqual(Object.keys(masksDocument(mask.data)), ['label', 'locked', 'baseImage', 'selection']);
});

test('modifier operations and coordinates preserve selections at arbitrary canvas zoom', () => {
  assert.equal(maskOperation({ shiftKey: false, altKey: false }), 'replace');
  assert.equal(maskOperation({ shiftKey: true, altKey: false }), 'add');
  assert.equal(maskOperation({ shiftKey: true, altKey: true }), 'subtract');
  assert.deepEqual(maskPoint(150, 100, { left: 50, top: 50, width: 200, height: 100 }), { x: .5, y: .5 });
  assert.equal(maskPoint(10, 10, { left: 50, top: 50, width: 200, height: 100 }), undefined);
  assert.equal(maskPoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }), undefined);
});

test('both outputs connect to image consumers; mask semantics survive a Router', () => {
  const graph = [file, mask, preview];
  assert.ok(canConnect(input, graph, []));
  assert.equal(canConnect({ ...input, source: 'mask' }, graph, []), false);
  assert.equal(canConnect(input, graph, [input]), false);
  assert.ok(canConnect(connect(), graph, [input])); assert.ok(canConnect(connect('result'), graph, [input]));
  assert.equal(canConnect(connect('invalid'), graph, [input]), false);
  assert.equal(canConnect(connect(), graph.map(node => node.id === 'mask' ? { ...mask, data: { ...mask.data, locked: true } } : node), []), false);
  const text: AppNode = { id: 'text', type: 'text', position: { x: 0, y: 0 }, data: { text: 'x' } };
  assert.equal(canConnect({ ...connect(), target: 'text', targetHandle: 'variable-1' }, [...graph, text], []), false);
  const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const edge = { id: 'r', source: 'mask', sourceHandle: 'mask', target: 'router', targetHandle: 'input' };
  assert.equal(outputKind(router, 'output', [...graph, router], [edge]), 'mask');
  assert.deepEqual(imageOutput(router, 'output', [...graph, router], [input, edge]), [mask.data.mask]);
  const pending = { nodeId: 'mask', handleId: 'mask', direction: 'source' as const, screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, graph, [input]).some(choice => choice.itemId === 'sunburst' && choice.handleId === 'mask'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'file', handleId: 'file' }, graph, []).some(choice => choice.itemId === 'masks-extractor'));
});

test('disconnect, input replacement and changed selection invalidate both outputs synchronously', () => {
  const graph = [file, mask, preview];
  for (const handle of ['result', 'mask']) {
    assert.equal(imageOutput(mask, handle, graph, [input]).length, 1);
    assert.deepEqual(imageOutput(mask, handle, graph, []), []);
    const changed = { ...mask, data: { ...mask.data, selection: { ...selection, id: 'new-selection' } } };
    assert.deepEqual(imageOutput(changed, handle, [file, changed], [input]), []);
    const replaced: AppNode = { ...file, data: { assets: [{ ...image, id: 'replacement' }] } };
    assert.deepEqual(imageOutput(mask, handle, [replaced, mask], [input]), []);
  }
  const copy = { ...mask, data: { ...mask.data, baseImage: image } };
  assert.equal(imageOutput(copy, 'result', [copy], []).length, 1);
});

test('Sunburst consumes the black-white output as luminance, including through a Router', () => {
  const sun: AppNode = { id: 'sun', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'text', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Edit the selected object' } };
  const router: AppNode = { id: 'r', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const edges = [input,
    { id: 'p', source: 'text', target: 'sun', targetHandle: 'prompt' },
    { id: 'i', source: 'file', sourceHandle: 'file', target: 'sun', targetHandle: 'image-0' },
    { id: 'r', source: 'mask', sourceHandle: 'mask', target: 'r', targetHandle: 'input' },
    { id: 'm', source: 'r', sourceHandle: 'output', target: 'sun', targetHandle: 'mask' },
  ];
  const prepared = prepareSunburstRun([file, mask, sun, prompt, router], edges, ['sun'], 1);
  assert.equal(prepared.error, undefined);
  assert.equal(prepared.tasks[0].imageRequest?.mask, 'blob:bw');
  assert.equal(prepared.tasks[0].imageRequest?.maskMode, 'luminance');
});

test('storage mapping and resource ownership retain both outputs and the standalone input', () => {
  const standalone = { ...mask, data: { ...mask.data, baseImage: image } };
  assert.deepEqual(nodeAssetUrls([standalone]), new Set(['blob:cutout', 'blob:bw', 'blob:input']));
  const mapped = mapAssets([standalone], asset => ({ ...asset, url: `restored:${asset.id}` }))[0] as MasksExtractorNode;
  assert.equal(mapped.data.baseImage?.url, 'restored:image');
  assert.equal(mapped.data.result?.url, 'restored:cutout'); assert.equal(mapped.data.mask?.url, 'restored:bw');
  assert.deepEqual(mapped.data.selection, selection);
});
