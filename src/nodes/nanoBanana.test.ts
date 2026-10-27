import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, NanoBananaNode } from './types';
import { defaultNanoBananaSettings, nanoBananaModel, nanoBananaParameterData } from './nanoBanana.ts';
import { prepareNanoBananaRun } from './nanoBananaRun.ts';
import { imageOutput } from './sunburstRun.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, initializeConnectionParameter, type PendingConnection } from './connectionRecommendations.ts';
import { extractFileAsset } from './fileCollection.ts';
import { nodeAssetUrls, taskAssetUrls } from './assetResources.ts';
import { mapAssets, workflowSnapshot } from '../persistence/workflowStorage.ts';
import { restoreNanoBananaData } from './nanoBananaClipboard.ts';

const asset: FileAsset = { id: 'a', name: 'a.png', kind: 'image', url: 'blob:a', width: 16, height: 9 };
const banana: NanoBananaNode = { id: 'banana', type: 'nano-banana', position: { x: 0, y: 0 }, data: { ...defaultNanoBananaSettings, imageInputs: 2 } };
const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Make a landscape' } };
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset] } };
const nodes = [banana, prompt, file];
const edges: Edge[] = [{ id: 'p', source: prompt.id, target: banana.id, targetHandle: 'prompt' }];
const imageEdge: Edge = { id: 'i', source: file.id, sourceHandle: 'file', target: banana.id, targetHandle: 'image-0' };

test('runs snapshot exact model, prompt, sorted references and exposed parameters', () => {
  const second: AppNode = { ...file, id: 'second', data: { assets: [{ ...asset, id: 'b', url: 'blob:b' }] } };
  const parameter: AppNode = { id: 'ratio', type: 'model-input', position: { x: 0, y: 0 }, data: nanoBananaParameterData('aspectRatio', '16:9') };
  const result = prepareNanoBananaRun([...nodes, second, parameter], [...edges,
    { ...imageEdge, id: 'second', source: second.id, targetHandle: 'image-1' }, imageEdge,
    { id: 'r', source: parameter.id, target: banana.id, targetHandle: 'aspectRatio' },
  ], [banana.id, banana.id], 2);
  assert.equal(result.error, undefined); assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].model, nanoBananaModel);
  assert.deepEqual(result.tasks[0].nanoBananaRequest, { ...defaultNanoBananaSettings, aspectRatio: '16:9', prompt: prompt.data.text, images: ['blob:a', 'blob:b'] });
  assert.deepEqual(taskAssetUrls(result.tasks[0]), ['blob:a', 'blob:b']);
  assert.equal(result.tasks[0].batchId, result.tasks[1].batchId);
  assert.notEqual(result.tasks[0].id, result.tasks[1].id);
  assert.deepEqual(prepareNanoBananaRun(nodes, edges, [banana.id], 1).tasks[0].nanoBananaRequest?.images, []);
});

test('invalid or missing input blocks the whole batch, locked nodes do not submit', () => {
  for (const runs of [0, 11, 1.5]) assert.ok(prepareNanoBananaRun(nodes, edges, [banana.id], runs).error);
  assert.ok(prepareNanoBananaRun(nodes, [], [banana.id], 1).error);
  assert.ok(prepareNanoBananaRun([banana, prompt], [...edges, imageEdge], [banana.id], 1).error);
  const tooMany = { ...file, data: { assets: Array(15).fill(asset) } };
  assert.ok(prepareNanoBananaRun([banana, prompt, tooMany], [...edges, imageEdge], [banana.id], 1).error);
  assert.equal(prepareNanoBananaRun([{ ...banana, data: { ...banana.data, locked: true } }, prompt], edges, [banana.id], 1).tasks.length, 0);
});

test('connection rules support prompt/image/results/Router and reject masks, nonexistent ports and cycles', () => {
  assert.equal(canConnect(edges[0], nodes, []), true);
  assert.equal(canConnect(imageEdge, nodes, edges), true);
  for (const targetHandle of ['mask', 'image-2', 'quality']) assert.equal(canConnect({ ...imageEdge, targetHandle }, nodes, edges), false);
  assert.equal(canConnect({ ...imageEdge, targetHandle: 'prompt' }, nodes, []), false);
  assert.equal(canConnect(imageEdge, nodes, [imageEdge]), false);
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  assert.equal(canConnect({ id: 'o', source: banana.id, sourceHandle: 'result', target: preview.id, targetHandle: 'file' }, [...nodes, preview], []), true);
  assert.equal(canConnect({ id: 'o', source: banana.id, sourceHandle: 'bad', target: preview.id, targetHandle: 'file' }, [...nodes, preview], []), false);
  const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const toRouter: Edge = { id: 'router', source: banana.id, sourceHandle: 'result', target: router.id, targetHandle: 'input' };
  assert.equal(canConnect({ ...imageEdge, source: router.id, sourceHandle: 'output' }, [...nodes, router], [toRouter]), false);
  const pending: PendingConnection = { nodeId: prompt.id, handleId: null, direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, nodes, []).some(choice => choice.itemId === 'nano-banana' && choice.handleId === 'prompt'));
  const exposed = { ...banana, data: { ...banana.data, exposed: ['imageSize' as const], imageSize: '2K' as const } };
  const parameter: AppNode = { id: 'param', type: 'model-input', position: { x: 0, y: 0 }, data: { model: '' } };
  assert.deepEqual(initializeConnectionParameter(parameter, { ...pending, nodeId: banana.id, direction: 'target', handleId: 'imageSize' }, [exposed]).data, nanoBananaParameterData('imageSize', '2K'));
});

test('selected result, extraction, clipboard, asset ownership and persisted data remain consistent', () => {
  const second = { ...asset, id: 'b', url: 'blob:b' };
  const generated: NanoBananaNode = { ...banana, data: { ...banana.data, label: 'My banana', results: [asset, second], activeResultId: asset.id, exposed: ['imageSize'] } };
  assert.deepEqual(imageOutput(generated, 'result'), [asset]);
  assert.deepEqual([...nodeAssetUrls([generated])], ['blob:a', 'blob:b']);
  const mapped = mapAssets([generated], item => ({ ...item, url: `blob:restored-${item.id}` }))[0] as NanoBananaNode;
  assert.equal(mapped.data.results?.[0].url, 'blob:restored-a');
  const copy = restoreNanoBananaData(generated.data)!;
  assert.equal(copy.label, 'My banana'); assert.equal(copy.activeResultId, asset.id); assert.equal(copy.exposed, undefined);
  const extracted = extractFileAsset([generated], generated.id, asset.id, { x: 20, y: 30 }, 'new-file');
  assert.equal((extracted[0] as NanoBananaNode).data.activeResultId, second.id);
  assert.deepEqual(imageOutput(extracted[1], 'file'), [asset]);
  const snapshot = workflowSnapshot({ nodes: [{ ...generated, selected: true }], edges: [], viewport: { x: 1, y: 2, zoom: .5 }, colorMode: 'dark' });
  assert.equal(snapshot.nodes[0].selected, undefined); assert.deepEqual(snapshot.nodes[0].data, generated.data);
});
