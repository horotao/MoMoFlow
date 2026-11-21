import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAssets, workflowSnapshot, WorkflowStorage, type Workflow } from './workflowStorage.ts';
import type { FileAsset, FileNode, SunburstNode } from '../nodes/types';

const asset: FileAsset = { id: 'image', kind: 'image', name: 'local.png', url: 'blob:old' };
const file: FileNode = { id: 'file', type: 'file', position: { x: 10, y: 20 }, data: { asset, assets: [asset], activeAssetId: asset.id, locked: true } };
const result: SunburstNode = { id: 'result', type: 'sunburst', position: { x: 30, y: 40 }, data: { composer: { prompt: '中文', quantity: 1, ratio: '1:1' }, quality: 'high', background: 'auto', size: '1024x1536', outputFormat: 'png', imageInputs: 2, results: [asset], activeResultId: asset.id, exposed: ['quality'] } };

test('snapshot retains Image data, position and lock without transient state', () => {
  const node = { ...result, selected: true, dragging: true, measured: { width: 384, height: 384 }, data: { ...result.data, locked: true } };
  const saved = workflowSnapshot({ nodes: [node], edges: [], viewport: { x: 3, y: 4, zoom: .8 }, colorMode: 'light' });
  assert.equal(saved.nodes.length, 1);
  assert.deepEqual((saved.nodes[0] as SunburstNode).data.composer, node.data.composer);
  assert.equal((saved.nodes[0] as SunburstNode).data.locked, true);
  assert.equal(saved.nodes[0].measured, undefined);
  assert.equal(saved.nodes[0].selected, undefined);
  assert.equal(node.selected, true);
  assert.equal(saved.colorMode, 'dark');
});

test('asset restoration covers legacy uploads, collections and generated results without mutating input', () => {
  const nodes = mapAssets([file, result], item => ({ ...item, url: 'blob:restored' }));
  const restored = nodes[0] as FileNode;
  assert.equal(restored.data.asset?.url, 'blob:restored');
  assert.equal(restored.data.assets?.[0].url, 'blob:restored');
  assert.equal((nodes[1] as SunburstNode).data.results?.[0].url, 'blob:restored');
  assert.equal(restored.data.activeAssetId, asset.id);
  assert.equal((nodes[1] as SunburstNode).data.activeResultId, asset.id);
  assert.equal(file.data.asset?.url, 'blob:old');
});

test('an intentionally empty workflow is still a versioned snapshot', () => {
  const saved = workflowSnapshot({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' });
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.nodes, []);
  assert.deepEqual(saved.edges, []);
});

test('unavailable IndexedDB rejects restoration and remains retryable', async () => {
  const storage = new WorkflowStorage();
  await assert.rejects(storage.load(), /indexedDB/);
  await assert.rejects(storage.load(), /indexedDB/);
  storage.dispose();
});

test('mixed legacy graphs discard retired nodes and dangling edges while preserving surviving assets and geometry', () => {
  const retired = { id: 'obsolete', type: 'ideogram', position: file.position, data: { results: [{ ...asset, url: 'blob:missing' }] } };
  const source = { ...result, id: 'upstream' };
  const kept = { id: 'reference', source: source.id, sourceHandle: 'result', target: result.id, targetHandle: 'image-0' };
  const saved = workflowSnapshot({
    nodes: [source, file, { ...result, id: 'old-gpt', data: { ...result.data, composer: undefined } }, retired as unknown as Workflow['nodes'][number], result],
    edges: [kept, { ...kept, id: 'dangling', source: retired.id }], colorMode: 'dark', viewport: { x: 3, y: 4, zoom: 0.8 },
  });
  assert.deepEqual(saved.nodes.map(node => node.id), [source.id, result.id]);
  assert.deepEqual(saved.edges.map(edge => edge.id), [kept.id]);
  assert.deepEqual(saved.nodes[1].position, result.position);
  assert.deepEqual((saved.nodes[1] as SunburstNode).data.results, [asset]);
  assert.deepEqual(saved.viewport, { x: 3, y: 4, zoom: 0.8 });
});
