import test from 'node:test';
import assert from 'node:assert/strict';
import { invertPixels, invertRevision, restoreInvertData, invertDocument } from './invert.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { defaultPainterData, painterRevision } from './painter.ts';
import type { AppNode, InvertNode, FileAsset } from './types';

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 640, height: 960 });
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const invert: InvertNode = { id: 'invert', type: 'invert', position: { x: 0, y: 0 }, data: { result: asset('result'), outputRevision: invertRevision('input') } };
const input = { id: 'in', source: 'file', sourceHandle: 'file', target: 'invert', targetHandle: 'image' };

test('invert swaps black/white, preserves soft edges and alpha, and is reversible without mutating input', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 64, 64, 64, 128, 32, 96, 224, 0]);
  const saved = pixels.slice();
  const result = invertPixels(pixels);
  assert.deepEqual([...result], [255, 255, 255, 255, 0, 0, 0, 255, 191, 191, 191, 128, 223, 159, 31, 0]);
  assert.deepEqual(pixels, saved);
  assert.deepEqual(invertPixels(result), pixels);
});

test('output invalidates on upstream changes, disconnection, stale versions and through chains', () => {
  assert.deepEqual(imageOutput(invert, 'result', [file, invert], [input]), [{ ...invert.data.result, maskMode: 'luminance' }]);
  assert.deepEqual(imageOutput(invert, 'result', [file, invert], []), []);
  assert.deepEqual(imageOutput(invert, 'invalid', [file, invert], [input]), []);
  assert.deepEqual(imageOutput(invert, 'result', [{ ...file, data: { assets: [asset('replacement')] } }, invert], [input]), []);
  const second: InvertNode = { ...invert, id: 'second', data: { result: asset('second-result'), outputRevision: invertRevision('result') } };
  const edges = [input, { id: 'chain', source: 'invert', sourceHandle: 'result', target: 'second', targetHandle: 'image' }];
  assert.equal(imageOutput(second, 'result', [file, invert, second], edges)[0].id, 'second-result');
  assert.deepEqual(imageOutput(second, 'result', [file, { ...invert, data: { ...invert.data, outputRevision: 'old' } }, second], edges), []);
  assert.deepEqual(imageOutput(invert, 'result', [invert, second], [edges[1], { ...input, source: 'second', sourceHandle: 'result' }]), []);
});

test('Painter black/white mask connects to Invert and downstream image tools', () => {
  const painter: AppNode = { id: 'painter', type: 'painter', position: { x: 0, y: 0 }, data: {
    ...defaultPainterData, mask: asset('mask'), outputRevision: painterRevision(defaultPainterData, ''),
  } };
  const maskEdge = { ...input, source: 'painter', sourceHandle: 'mask' };
  const maskInvert: InvertNode = { ...invert, data: { ...invert.data, outputRevision: invertRevision('mask') } };
  assert.equal(canConnect(maskEdge, [painter, maskInvert], []), true);
  assert.deepEqual(imageOutput(maskInvert, 'result', [painter, maskInvert], [maskEdge]), [{ ...invert.data.result, maskMode: 'luminance' }]);
  for (const type of ['preview', 'crop', 'blur', 'levels', 'color-correction', 'painter', 'invert', 'image-describer', 'sunburst']) {
    const target = { id: 'target', type, position: { x: 0, y: 0 }, data: {} } as AppNode;
    const targetHandle = ['preview', 'color-correction'].includes(type) ? 'file' : ['sunburst', 'image-describer'].includes(type) ? 'image-0' : 'image';
    assert.equal(canConnect({ id: 'out', source: 'invert', sourceHandle: 'result', target: 'target', targetHandle }, [invert, target], []), true, type);
  }
});

test('Painter → Invert → Sunburst converts only the mask request and rejects stale output', () => {
  const painter: AppNode = { id: 'painter', type: 'painter', position: { x: 0, y: 0 }, data: {
    ...defaultPainterData, mask: asset('mask'), alphaMask: asset('alpha'), outputRevision: painterRevision(defaultPainterData, ''),
  } };
  const maskInvert: InvertNode = { ...invert, data: { ...invert.data, outputRevision: invertRevision('mask') } };
  const generator: AppNode = { id: 'generator', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Edit the unpainted area' } };
  const nodes = [file, painter, maskInvert, generator, prompt];
  const maskEdge = { id: 'mask', source: 'invert', sourceHandle: 'result', target: 'generator', targetHandle: 'mask' };
  const edges = [
    { ...input, source: 'painter', sourceHandle: 'mask' }, maskEdge,
    { id: 'image', source: 'file', sourceHandle: 'file', target: 'generator', targetHandle: 'image-0' },
    { id: 'prompt', source: 'prompt', target: 'generator', targetHandle: 'prompt' },
  ];
  assert.ok(canConnect(maskEdge, nodes, edges.filter(edge => edge !== maskEdge)));
  const run = prepareSunburstRun(nodes, edges, ['generator'], 1);
  assert.equal(run.error, undefined);
  assert.equal(run.tasks[0].imageRequest?.mask, 'blob:result');
  assert.equal(run.tasks[0].imageRequest?.maskMode, 'luminance');
  assert.deepEqual(run.tasks[0].imageRequest?.images, ['blob:input']);
  assert.deepEqual(imageOutput(maskInvert, 'result', nodes, edges), [{ ...invert.data.result, maskMode: 'luminance' }]);

  const directEdges = edges.map(edge => edge === maskEdge ? { ...edge, source: 'painter', sourceHandle: 'mask' } : edge);
  const direct = prepareSunburstRun(nodes, directEdges, ['generator'], 1).tasks[0].imageRequest;
  assert.equal(direct?.mask, 'blob:alpha');
  assert.equal(direct?.maskMode, undefined);
  const imageOnlyEdges = edges.filter(edge => edge.id !== 'mask').map(edge => edge.id === 'image' ? { ...edge, source: 'invert', sourceHandle: 'result' } : edge);
  const imageOnly = prepareSunburstRun(nodes, imageOnlyEdges, ['generator'], 1).tasks[0].imageRequest;
  assert.deepEqual(imageOnly?.images, ['blob:result']);
  assert.equal(imageOnly?.maskMode, undefined);

  const disconnected = prepareSunburstRun(nodes, edges.filter(edge => edge.id !== input.id), ['generator'], 1);
  assert.equal(disconnected.tasks.length, 0);
  assert.match(disconnected.error!, /Mask/);
  const editedNodes = nodes.map(node => node.id === 'painter' ? { ...painter, data: { ...painter.data, background: '#ffffff' } } : node);
  assert.equal(prepareSunburstRun(editedNodes, edges, ['generator'], 1).tasks.length, 0);
});

test('connection rules reject incompatible inputs, locked nodes, duplicate connections, wrong handles and cycles', () => {
  assert.equal(canConnect(input, [file, invert], []), true);
  assert.equal(canConnect(input, [file, invert], [input]), false);
  assert.equal(canConnect({ ...input, targetHandle: 'bad' }, [file, invert], []), false);
  assert.equal(canConnect(input, [file, { ...invert, data: { locked: true } }], []), false);
  for (const source of [{ ...file, type: 'text', data: { text: 'bad' } }, { ...file, data: { assets: [{ ...asset('video'), kind: 'video' }] } }]) {
    assert.equal(canConnect(input, [source as AppNode, invert], []), false);
  }
  const second: InvertNode = { ...invert, id: 'second' };
  const edge = { ...input, source: 'second', sourceHandle: 'result' };
  assert.equal(canConnect({ ...edge, sourceHandle: 'bad' }, [invert, second], []), false);
  assert.equal(canConnect(edge, [invert, second], [{ id: 'cycle', source: 'invert', target: 'second' }]), false);
  const pending: PendingConnection = { nodeId: 'file', handleId: 'file', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, [file], []).some(item => item.itemId === 'invert'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'invert', handleId: 'result' }, [invert], []).some(item => item.itemId === 'preview'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'invert', handleId: 'image', direction: 'target' }, [invert], []).some(item => item.itemId === 'painter' && item.handleId === 'mask'));
});

test('clipboard and history omit generated results; asset persistence retains both images', () => {
  const detached: InvertNode = { ...invert, data: { ...invert.data, baseImage: asset('input'), locked: true } };
  assert.deepEqual(imageOutput(detached, 'result', [detached], []), [{ ...invert.data.result, maskMode: 'luminance' }]);
  const restored = restoreInvertData(detached.data)!;
  assert.equal(restored.baseImage?.id, 'input');
  assert.equal(restored.locked, false);
  assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined);
  assert.equal('result' in invertDocument(detached.data), false);
  for (const value of [null, 'bad', { baseImage: {} }, { baseImage: { ...asset('video'), kind: 'video' } }]) {
    assert.equal(restoreInvertData(value), undefined);
  }
  const [mapped] = mapAssets([detached], image => ({ ...image, url: `${image.url}-restored` }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});
