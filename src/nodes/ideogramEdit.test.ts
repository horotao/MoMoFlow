import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, CompareNode, FileAsset, IdeogramNode } from './types';
import { defaultIdeogramSettings, defaultIdeogramEditSettings, ideogramEditModel, validateIdeogramEditSize, validateIdeogramEditSettings } from './ideogram.ts';
import { prepareIdeogramRun } from './ideogramRun.ts';
import { normalizeIdeogramMask } from './ideogramMask.ts';
import { restoreIdeogramData } from './ideogramClipboard.ts';
import { taskAssetUrls } from './assetResources.ts';
import { defaultPainterData, painterRevision } from './painter.ts';
import { defaultCompareData, restoreCompareData } from './compare.ts';
import { imageOutput } from './sunburstRun.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { invertRevision } from './invert.ts';
import { encodeMask, masksRevision } from './masksExtractor.ts';

const asset: FileAsset = { id: 'a', name: 'a.png', kind: 'image', url: 'blob:source', width: 1024, height: 1024 };
const generator: IdeogramNode = { id: 'gen', type: 'ideogram', position: { x: 0, y: 0 }, data: { ...defaultIdeogramSettings, ...defaultIdeogramEditSettings, imageInputs: 5, editSize: '1536*1024' } };
const file = (id: string, assets = [{ ...asset, url: `blob:${id}` }]): AppNode => ({ id, type: 'file', position: { x: 0, y: 0 }, data: { assets } });
const nodes: AppNode[] = [generator, { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Change the sky' } }, file('source'), file('ref1'), file('ref2'), file('mask')];
const edge = (source: string, targetHandle: string): Edge => ({ id: `${source}-${targetHandle}`, source, sourceHandle: source === 'prompt' ? undefined : 'file', target: 'gen', targetHandle });
const edges = [edge('prompt', 'prompt'), edge('source', 'image-0')];

test('edit snapshots one original and ordered references, preserves source URLs while queued', () => {
  const result = prepareIdeogramRun(nodes, [...edges, edge('ref2', 'image-2'), edge('ref1', 'image-1')], ['gen'], 2);
  assert.equal(result.error, undefined);
  assert.equal(result.tasks[0].model, ideogramEditModel);
  assert.deepEqual(result.tasks[0].ideogramRequest, { ...defaultIdeogramEditSettings, editSize: '1536*1024', prompt: 'Change the sky', image: 'blob:source', referenceImages: ['blob:ref1', 'blob:ref2'] });
  assert.deepEqual(taskAssetUrls(result.tasks[0]), ['blob:source', 'blob:ref1', 'blob:ref2']);
  assert.notEqual(result.tasks[0].ideogramRequest?.referenceImages, result.tasks[1].ideogramRequest?.referenceImages);
});

test('missing source, empty connected inputs, ambiguous originals and excess references block edit', () => {
  for (const handle of ['mask', 'image-1']) assert.match(prepareIdeogramRun(nodes, [edges[0], edge('mask', handle)], ['gen'], 1).error!, /原图/);
  for (const assets of [[], [asset, asset]]) assert.match(prepareIdeogramRun([...nodes.filter(n => n.id !== 'source'), file('source', assets)], edges, ['gen'], 1).error!, /一张/);
  assert.match(prepareIdeogramRun([...nodes, file('empty', [])], [...edges, edge('empty', 'image-1')], ['gen'], 1).error!, /尚无图片/);
  const collection = file('collection', Array.from({ length: 4 }, (_, i) => ({ ...asset, url: `blob:${i}` })));
  assert.equal(prepareIdeogramRun([...nodes, collection], [...edges, edge('collection', 'image-1')], ['gen'], 1).error, undefined);
  assert.match(prepareIdeogramRun([...nodes, collection], [...edges, edge('collection', 'image-1'), edge('mask', 'mask')], ['gen'], 1).error!, /3 张/);
  assert.match(prepareIdeogramRun([...nodes, collection], [...edges, edge('collection', 'image-1'), edge('ref1', 'image-2')], ['gen'], 1).error!, /4 张/);
});

test('mask/high precision use source dimensions without erasing saved custom size or generation settings', () => {
  const masked = prepareIdeogramRun(nodes, [...edges, edge('mask', 'mask')], ['gen'], 1).tasks[0];
  assert.equal(masked.ideogramRequest?.image && masked.ideogramRequest.editSize, 'auto');
  assert.deepEqual(taskAssetUrls(masked), ['blob:source', 'blob:mask']);
  const high: IdeogramNode = { ...generator, data: { ...generator.data, editPrecision: 'high' } };
  const request = prepareIdeogramRun([high, ...nodes.slice(1)], edges, ['gen'], 1).tasks[0].ideogramRequest;
  assert.equal(request?.image && request.editSize, 'auto');
  const restored = restoreIdeogramData(high.data)!;
  assert.equal(restored.editSize, '1536*1024'); assert.equal(restored.editPrecision, 'high');
  assert.equal(restored.resolution, '1k'); assert.equal(restored.imageInputs, 5);
  const legacy = { ...generator, data: { ...defaultIdeogramSettings, imageInputs: 0 } };
  assert.equal(prepareIdeogramRun([legacy, ...nodes.slice(1)], edges, ['gen'], 1).tasks[0].model, ideogramEditModel);
});

test('Router retains mask semantics and Painter uses its transparent editing mask', () => {
  const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const mask = file('mask', [{ ...asset, url: 'blob:luma', maskMode: 'luminance' }]);
  const routes = [...edges, { ...edge('mask', 'input'), target: 'router' }, { ...edge('router', 'mask'), sourceHandle: 'output' }];
  const request = prepareIdeogramRun([...nodes.filter(n => n.id !== 'mask'), mask, router], routes, ['gen'], 1).tasks[0].ideogramRequest;
  assert.equal(request?.image && request.maskMode, 'luminance');
  const painter: AppNode = { id: 'painter', type: 'painter', position: { x: 0, y: 0 }, data: { ...defaultPainterData, outputRevision: painterRevision(defaultPainterData), mask: asset, alphaMask: { ...asset, url: 'blob:alpha' } } };
  const painted = prepareIdeogramRun([...nodes, painter], [...edges, { ...edge('painter', 'mask'), sourceHandle: 'mask' }], ['gen'], 1).tasks[0].ideogramRequest;
  assert.equal(painted?.mask, 'blob:alpha');
});

const paintedMask: FileAsset = { ...asset, id: 'painted-mask', url: 'blob:painted-mask' };
const paintedAlpha: FileAsset = { ...asset, id: 'painted-alpha', url: 'blob:painted-alpha' };
const painter: AppNode = { id: 'painter', type: 'painter', position: { x: 0, y: 0 }, data: {
  ...defaultPainterData, outputRevision: painterRevision(defaultPainterData), mask: paintedMask, alphaMask: paintedAlpha, result: asset,
} };
const maskPixels = new Map([
  [paintedMask.url, [0, 0, 0, 255, 127, 127, 127, 255, 128, 128, 128, 255, 255, 255, 255, 255]],
  [paintedAlpha.url, [0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 127, 0, 0, 0, 0]],
]);
const prepareMask = (graph: AppNode[], connections: Edge[]) => {
  const result = prepareIdeogramRun(graph, [...edges, ...connections], ['gen'], 1);
  assert.equal(result.error, undefined);
  const request = result.tasks[0].ideogramRequest;
  assert.ok(request?.image && request.mask);
  return request;
};
const submittedMask = (request: ReturnType<typeof prepareMask>) => {
  const input = maskPixels.get(request.mask!); assert.ok(input);
  const pixels = new Uint8ClampedArray(input);
  normalizeIdeogramMask(pixels, request.maskMode);
  return [...pixels];
};

test('Painter mask editing pixels match direct input through either Compare port and chained Routers', () => {
  const direct = prepareMask([...nodes, painter], [{ ...edge('painter', 'mask'), sourceHandle: 'mask' }]);
  const expected = [255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255];
  assert.deepEqual(submittedMask(direct), expected);
  for (const port of [1, 2]) for (const mode of ['slider', 'toggle'] as const) {
    const compare: CompareNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { ...defaultCompareData, mode } };
    const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
    const next: CompareNode = { ...compare, id: 'next' };
    const input: Edge = { id: 'paint-to-compare', source: 'painter', sourceHandle: 'mask', target: 'compare', targetHandle: `input-${port}` };
    const graph = [...nodes, painter, compare, router, next];
    const throughCompare = prepareMask(graph, [input, { ...edge('compare', 'mask'), sourceHandle: `output-${port}` }]);
    assert.deepEqual(submittedMask(throughCompare), expected, `${mode} output-${port}`);
    const chained = prepareMask(graph, [input,
      { id: 'router', source: 'compare', sourceHandle: `output-${port}`, target: 'router', targetHandle: 'input' },
      { id: 'next', source: 'router', sourceHandle: 'output', target: 'next', targetHandle: 'input-2' },
      { ...edge('next', 'mask'), sourceHandle: 'output-2' },
    ]);
    assert.deepEqual(submittedMask(chained), expected);
  }
  assert.equal(paintedMask.maskMode, undefined, 'Reading legacy masks must not mutate node assets');
  assert.equal(imageOutput(painter, 'result', [...nodes, painter], [])[0].maskMode, undefined);
});

test('Compare mask snapshots retain editing semantics through clipboard and asset restoration', () => {
  for (const port of [1, 2]) {
    const compare: CompareNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { ...defaultCompareData } };
    const input: Edge = { id: 'paint-to-compare', source: 'painter', sourceHandle: 'mask', target: 'compare', targetHandle: `input-${port}` };
    const snapshot = imageOutput(compare, `output-${port}`, [...nodes, painter, compare], [input])[0];
    const copied = { ...compare, data: restoreCompareData({ ...compare.data, [`input${port}`]: snapshot })! };
    const restored = mapAssets([copied], value => ({ ...value, url: `restored:${value.url}` }))[0] as CompareNode;
    const output = imageOutput(restored, `output-${port}`, [restored], [])[0];
    assert.equal(output.maskMode, 'luminance');
    const request = prepareMask([...nodes, restored], [{ ...edge('compare', 'mask'), sourceHandle: `output-${port}` }]);
    assert.equal(request.maskMode, 'luminance'); assert.equal(request.mask, `restored:${paintedMask.url}`);
    assert.deepEqual(imageOutput(compare, `output-${port}`, [compare, { ...painter, data: { ...painter.data, outputRevision: 'stale' } }], [input]), []);
  }
});

test('Compare preserves imported black-edit masks without treating every image as an app mask', () => {
  const compare: CompareNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { ...defaultCompareData } };
  const raw = file('raw', [paintedMask]);
  const request = prepareMask([...nodes, raw, compare], [
    { id: 'raw-input', source: 'raw', sourceHandle: 'file', target: 'compare', targetHandle: 'input-1' },
    { ...edge('compare', 'mask'), sourceHandle: 'output-1' },
  ]);
  assert.equal(request.maskMode, undefined);
  assert.deepEqual(submittedMask(request), [0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
});

test('Invert and Masks Extractor keep white-edit semantics through Compare, including legacy outputs', () => {
  const invert: AppNode = { id: 'invert', type: 'invert', position: { x: 0, y: 0 }, data: { baseImage: asset, result: paintedMask, outputRevision: invertRevision(asset.id) } };
  const extractor: AppNode = { id: 'extractor', type: 'masks-extractor', position: { x: 0, y: 0 }, data: {
    baseImage: asset, selection: encodeMask({ width: 2, height: 1, pixels: new Uint8Array([0, 1]) }, asset.id, 'selection'), mask: paintedMask, result: asset,
  } };
  extractor.data.outputRevision = masksRevision(extractor.data, asset.id);
  for (const [source, handle] of [[invert, 'result'], [extractor, 'mask']] as const) for (const port of [1, 2]) {
    const compare: CompareNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { ...defaultCompareData } };
    const graph = [...nodes, source, compare];
    const direct = prepareMask(graph, [{ ...edge(source.id, 'mask'), sourceHandle: handle }]);
    const compared = prepareMask(graph, [
      { id: 'input', source: source.id, sourceHandle: handle, target: 'compare', targetHandle: `input-${port}` },
      { ...edge('compare', 'mask'), sourceHandle: `output-${port}` },
    ]);
    assert.equal(compared.maskMode, 'luminance');
    assert.deepEqual(submittedMask(compared), submittedMask(direct));
  }
  assert.equal(imageOutput(extractor, 'result', [...nodes, extractor], [])[0].maskMode, undefined);
});

test('edit validates documented dimensions and incompatible parameters', () => {
  for (const size of ['auto', '256*256', '2048*2048', '4992*832']) assert.equal(validateIdeogramEditSize(size), size);
  for (const size of ['255*256', '1025*1024', '2048*2080', '4992*256', '5024*832', '1024x1024', '']) assert.throws(() => validateIdeogramEditSize(size));
  assert.throws(() => validateIdeogramEditSettings({ editSize: '1024*1024', editPrecision: 'high' }));
  assert.throws(() => validateIdeogramEditSettings({ editSize: '1024*1024' }, true));
  for (const values of [{ editQuality: 'ultra' }, { editPrecision: 'low' }]) assert.throws(() => validateIdeogramEditSettings(values));
});

test('Mask normalization keeps imported black editable, inverts app white masks and handles alpha', () => {
  const opaque = [0, 0, 0, 255, 255, 255, 255, 255];
  const raw = new Uint8ClampedArray(opaque); normalizeIdeogramMask(raw); assert.deepEqual([...raw], opaque);
  const luma = new Uint8ClampedArray(opaque); normalizeIdeogramMask(luma, 'luminance');
  assert.deepEqual([...luma], [255, 255, 255, 255, 0, 0, 0, 255]);
  const alpha = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]); normalizeIdeogramMask(alpha, 'luminance');
  assert.deepEqual([...alpha], [...luma]);
  for (const pixel of [[0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 0]]) assert.throws(() => normalizeIdeogramMask(new Uint8ClampedArray(pixel)), /同时包含/);
});
