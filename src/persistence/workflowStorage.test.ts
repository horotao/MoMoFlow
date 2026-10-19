import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAssets, workflowSnapshot, WorkflowStorage, type Workflow } from './workflowStorage.ts';
import type { FileAsset, FileNode, SunburstNode } from '../nodes/types';

const asset: FileAsset = { id: 'image', kind: 'image', name: 'local.png', url: 'blob:old' };
const file: FileNode = { id: 'file', type: 'file', position: { x: 10, y: 20 }, data: { asset, assets: [asset], activeAssetId: asset.id, locked: true } };
const result: SunburstNode = { id: 'result', type: 'sunburst', position: { x: 30, y: 40 }, data: { quality: 'high', background: 'auto', size: '1024x1536', outputFormat: 'png', imageInputs: 2, results: [asset], activeResultId: asset.id, exposed: ['quality'] } };

test('snapshot retains rich text, locked nodes, geometry and parameters without transient selection state', () => {
  const workflow: Workflow = {
    nodes: [{ ...file, selected: true, dragging: true, measured: { width: 300, height: 500 } }, result,
      { id: 'text', type: 'text', position: { x: 0, y: 0 }, origin: [1, 0.5], data: { text: '中文', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'promptVariable', attrs: { handleId: 'variable-0', ownerId: 'text' } }] }] }, variableCount: 2, displayMode: 'value' } }],
    edges: [{ id: 'edge', source: 'text', target: 'result', targetHandle: 'prompt', selected: true }],
    viewport: { x: -120, y: 300, zoom: 0.65 }, colorMode: 'light',
  };
  const saved = workflowSnapshot(workflow);
  assert.deepEqual(saved.nodes[0].data, file.data);
  assert.deepEqual(saved.nodes[1], { ...result, selected: undefined, dragging: undefined, measured: undefined, resizing: undefined });
  assert.deepEqual(saved.nodes[2].data, workflow.nodes[2].data);
  assert.deepEqual(saved.nodes[2].origin, [1, 0.5]);
  assert.equal(saved.nodes[0].selected, undefined);
  assert.equal(saved.nodes[0].dragging, undefined);
  assert.equal(saved.nodes[0].measured, undefined);
  assert.equal(workflow.nodes[0].selected, true);
  assert.deepEqual(saved.viewport, workflow.viewport);
  assert.equal(saved.edges[0].targetHandle, 'prompt');
  assert.equal(saved.edges[0].selected, undefined);
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
