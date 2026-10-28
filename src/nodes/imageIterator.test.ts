import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultImageIteratorData, imageIterationSignature, readImageIteratorData, validateImageIteratorAssets } from './imageIterator.ts';
import { iterationGraph, planExecution, graphGuard } from './executionGraph.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { extractFileAsset } from './fileCollection.ts';
import { imageOutput } from './sunburstRun.ts';
import { outputKind } from './router.ts';
import type { AppNode, FileAsset, ImageIteratorNode } from './types';

const assets: FileAsset[] = ['z', 'a'].map(id => ({ id, name: `${id}.png`, url: `blob:${id}`, kind: 'image' }));
const iterator: ImageIteratorNode = { id: 'iterator', type: 'image-iterator', position: { x: 0, y: 0 }, data: { assets, activeAssetId: 'a', viewMode: 'all' } };
const model: AppNode = { id: 'model', type: 'sunburst', position: { x: 500, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 400 }, data: { text: '编辑图片' } };
const connection = { id: 'images', source: 'iterator', sourceHandle: 'file', target: 'model', targetHandle: 'image-0' };
const graph = { nodes: [iterator, model, prompt], edges: [connection, { id: 'prompt', source: 'prompt', target: 'model', targetHandle: 'prompt' }] };

test('image iterator validates images and clipboard data while preserving empty import state', () => {
  assert.deepEqual(defaultImageIteratorData(), { assets: [], viewMode: 'all' });
  assert.throws(() => validateImageIteratorAssets([]), /至少/);
  assert.throws(() => validateImageIteratorAssets([...assets, assets[0]]), /独立图片/);
  assert.throws(() => validateImageIteratorAssets([{ ...assets[0], kind: 'video' }]), /图片/);
  assert.throws(() => validateImageIteratorAssets(Array.from({ length: 51 }, (_, id) => ({ ...assets[0], id: String(id) }))), /50/);
  const restored = readImageIteratorData(iterator.data)!;
  assert.deepEqual(restored.assets, assets); assert.notEqual(restored.assets, assets);
  assert.equal(readImageIteratorData({ assets: 'invalid' }), undefined);
  assert.equal(readImageIteratorData({ assets: [{ ...assets[0], url: 'javascript:alert(1)' }] }), undefined);
  assert.deepEqual(readImageIteratorData({})?.assets, []);
});

test('image source connects while empty, has no input, and never enters text ports', () => {
  const empty = { ...iterator, data: defaultImageIteratorData() };
  assert.equal(outputKind(empty, 'file'), 'image');
  assert.equal(outputKind(empty, 'text'), undefined);
  assert.ok(canConnect(connection, [empty, model], []));
  assert.ok(!canConnect({ ...connection, targetHandle: 'prompt' }, [empty, model], []));
  assert.ok(!canConnect({ ...connection, target: 'prompt', targetHandle: 'variable-1' }, [iterator, prompt], []));
  assert.ok(!canConnect({ ...connection, source: 'model', sourceHandle: 'result', target: 'iterator', targetHandle: 'input' }, [iterator, model], []));
  assert.ok(!canConnect(connection, [{ ...iterator, data: { ...iterator.data, locked: true } }, model], []));
  const choices = connectionChoices({ nodeId: 'model', handleId: 'image-0', direction: 'target', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } }, graph.nodes, []);
  assert.ok(choices.some(choice => choice.itemId === 'image-iterator' && choice.handleId === 'file'));
});

test('batch uses all images in order while each execution snapshot exposes only its own image', () => {
  assert.deepEqual(imageOutput(iterator, 'file').map(asset => asset.id), ['a'], 'canvas preview uses cover');
  const plans = planExecution(graph, ['model'], 2).get('model')!;
  assert.deepEqual(plans.map(item => item?.itemId), ['z', 'a']);
  for (const iteration of plans) {
    const snapshot = iterationGraph(graph, iteration);
    assert.deepEqual(imageOutput(snapshot.nodes[0], 'file').map(asset => asset.id), [iteration?.itemId]);
  }
  assert.equal(graph.nodes[0].type, 'image-iterator');
  assert.deepEqual(iterator.data.assets, assets);
  const sorted = { ...graph, nodes: graph.nodes.map(node => node.id === 'iterator' ? { ...iterator, data: { ...iterator.data, orderBy: 'name' as const } } : node) };
  assert.deepEqual(planExecution(sorted, ['model'], 1).get('model')!.map(item => item?.itemId), ['a', 'z']);
  assert.notEqual(graphGuard(sorted, 'model'), graphGuard(graph, 'model'));
  assert.equal(graphGuard({ ...graph, nodes: graph.nodes.map(node => node.id === 'iterator' ? { ...iterator, data: { ...iterator.data, activeAssetId: 'z', viewMode: 'single' as const } } : node) }, 'model'), graphGuard(graph, 'model'));
});

test('image iterator assets survive restoration and extraction without losing ownership or retry identity', () => {
  assert.deepEqual([...nodeAssetUrls([iterator])], ['blob:z', 'blob:a']);
  const restored = mapAssets([iterator], asset => ({ ...asset, url: `${asset.url}-restored` }))[0] as ImageIteratorNode;
  assert.deepEqual([...nodeAssetUrls([restored])], ['blob:z-restored', 'blob:a-restored']);
  assert.equal(imageIterationSignature(restored.data.assets![0]), imageIterationSignature(assets[0]));
  const extracted = extractFileAsset([iterator], 'iterator', 'z', { x: 20, y: 30 }, 'extracted');
  assert.equal(extracted[0].type, 'image-iterator');
  assert.deepEqual((extracted[0] as ImageIteratorNode).data.assets, [assets[1]]);
  assert.equal(extracted[1].type, 'file');
  assert.deepEqual([...nodeAssetUrls(extracted)], ['blob:a', 'blob:z']);
});

test('empty or invalid images and multiple independent iterators fail before starting a batch', () => {
  for (const value of [[], [{ ...assets[0], kind: 'video' as const }]]) {
    assert.throws(() => planExecution({ ...graph, nodes: [{ ...iterator, data: { assets: value } }, model, prompt] }, ['model'], 1), /图片/);
  }
  const textIterator: AppNode = { id: 'texts', type: 'text-iterator', position: { x: 0, y: 0 }, data: { items: [{ id: 'text', text: 'prompt' }] } };
  assert.throws(() => planExecution({ nodes: [iterator, model, textIterator], edges: [connection, { id: 'texts', source: 'texts', sourceHandle: 'text', target: 'model', targetHandle: 'prompt' }] }, ['model'], 1), /一个迭代器/);
});
