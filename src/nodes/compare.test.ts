import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, CompareNode, FileAsset } from './types';
import { defaultCompareData, restoreCompareData } from './compare.ts';
import { imageOutput } from './sunburstRun.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
const a: FileAsset = { id: 'a', kind: 'image', name: 'a.png', url: 'blob:a', width: 3840, height: 2160 };
const b: FileAsset = { ...a, id: 'b', url: 'blob:b', width: 200, height: 300 };
const compare: CompareNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { ...defaultCompareData } };
const files: AppNode[] = [a, b].map(asset => ({ id: asset.id, type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset] } }));
const nodes: AppNode[] = [...files, compare];
const edges: Edge[] = [a, b].map((asset, index) => ({ id: asset.id, source: asset.id, sourceHandle: 'file', target: compare.id, targetHandle: `input-${index + 1}` }));
test('Compare forwards each original image independently across modes, replacement and disconnection', () => {
  for (const mode of ['slider', 'toggle'] as const) for (const split of [0, .3, 1]) {
    const current = { ...compare, data: { mode, split } };
    assert.deepEqual(imageOutput(current, 'output-1', nodes, edges), [a]);
    assert.deepEqual(imageOutput(current, 'output-2', nodes, edges), [b]);
    assert.deepEqual(imageOutput(current, 'result', nodes, edges), []);
  }
  assert.deepEqual(imageOutput(compare, 'output-1', nodes, edges.slice(1)), []);
  assert.deepEqual(imageOutput(compare, 'output-2', nodes, edges.slice(1)), [b]);
  assert.deepEqual(imageOutput(compare, 'output-1', nodes, [{ ...edges[0], source: 'b' }]), [b]);
  const fallback = { ...compare, data: { ...compare.data, input1: b } };
  assert.deepEqual(imageOutput(fallback, 'output-1', nodes, []), [b]);
  assert.deepEqual(imageOutput(fallback, 'output-1', nodes, [{ ...edges[0], source: 'missing' }]), []);
});
test('Compare permits shared upstream images, resolves chains, and terminates corrupt cycles', () => {
  const next = { ...compare, id: 'next' };
  const graph = [...nodes, next];
  const connections = [...edges, { id: 'next', source: 'compare', sourceHandle: 'output-2', target: 'next', targetHandle: 'input-1' }];
  assert.deepEqual(imageOutput(next, 'output-1', graph, connections), [b]);
  assert.deepEqual(imageOutput(compare, 'output-2', nodes, [edges[0], { ...edges[1], source: 'a' }]), [a]);
  assert.deepEqual(imageOutput(next, 'output-1', graph, [connections[2], { id: 'cycle', source: 'next', sourceHandle: 'output-1', target: 'compare', targetHandle: 'input-2' }]), []);
});
test('Compare validates both ports, occupied inputs, image consumers, locks and cycles', () => {
  for (const edge of edges) { assert.ok(canConnect(edge, nodes, [])); assert.equal(canConnect(edge, nodes, [edge]), false); }
  assert.equal(canConnect({ ...edges[0], targetHandle: 'image' }, nodes, []), false);
  assert.equal(canConnect(edges[0], [...files, { ...compare, data: { ...compare.data, locked: true } }], []), false);
  const text: AppNode = { id: 'text', type: 'text', position: { x: 0, y: 0 }, data: { text: 'test' } };
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  assert.equal(canConnect({ ...edges[0], source: 'text' }, [...nodes, text], []), false);
  for (const sourceHandle of ['output-1', 'output-2']) {
    assert.ok(canConnect({ source: 'compare', sourceHandle, target: 'preview', targetHandle: 'file' }, [...nodes, preview], []));
    assert.equal(canConnect({ source: 'compare', sourceHandle, target: 'text', targetHandle: 'variable-1' }, [...nodes, text], []), false);
  }
  assert.equal(canConnect({ source: 'compare', sourceHandle: 'result', target: 'preview', targetHandle: 'file' }, [...nodes, preview], []), false);
  const pending = { nodeId: 'compare', direction: 'target' as const, handleId: 'input-2', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, nodes, []).some(choice => choice.itemId === 'file'));
  assert.deepEqual(connectionChoices(pending, nodes, edges), []);
});
test('Compare snapshots validate clipboard data and preserve both asset lifetimes during storage', () => {
  const copied = { ...compare, data: { ...compare.data, input1: a, input2: b, locked: true } };
  assert.equal(restoreCompareData(copied.data)?.locked, false);
  for (const split of [NaN, Infinity, -1, 2]) assert.equal(restoreCompareData({ ...copied.data, split }), undefined);
  assert.equal(restoreCompareData({ ...copied.data, input2: { ...b, kind: 'video' } }), undefined);
  assert.deepEqual([...nodeAssetUrls([copied])], ['blob:a', 'blob:b']);
  const mapped = mapAssets([copied], asset => ({ ...asset, url: `saved:${asset.id}` }))[0] as CompareNode;
  assert.equal(mapped.data.input1?.url, 'saved:a'); assert.equal(mapped.data.input2?.url, 'saved:b');
});
