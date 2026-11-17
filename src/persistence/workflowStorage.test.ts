import { defaultNanoBananaSettings } from '../nodes/nanoBanana.ts';
import { defaultSeedreamSettings } from '../nodes/seedream.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAssets, workflowSnapshot, WorkflowStorage, type Workflow } from './workflowStorage.ts';
import type { FileAsset, FileNode, ModelInputNode, NanoBananaNode, SeedreamNode, SunburstNode } from '../nodes/types';

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
  assert.deepEqual(saved.nodes[1], { ...result, selected: undefined, dragging: undefined, measured: undefined, resizing: undefined,
    data: Object.fromEntries(Object.entries(result.data).filter(([key]) => key !== 'exposed')),
  });
  assert.deepEqual(saved.nodes[2].data, workflow.nodes[2].data);
  assert.deepEqual(saved.nodes[2].origin, [1, 0.5]);
  assert.equal(saved.nodes[0].selected, undefined);
  assert.equal(saved.nodes[0].dragging, undefined);
  assert.equal(saved.nodes[0].measured, undefined);
  assert.equal(workflow.nodes[0].selected, true);
  assert.deepEqual(saved.viewport, workflow.viewport);
  assert.equal(saved.colorMode, 'dark');
  assert.equal(workflow.colorMode, 'light');
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

test('workflow snapshots migrate local and routed channel selections into local settings and retain source nodes and unrelated links', () => {
  const legacy = { ...result, id: 'legacy', data: { ...result.data, provider: 'zenmux', locked: true } };
  const connected: SunburstNode = { ...result, data: { ...result.data, provider: 'openai', exposed: ['provider'] } };
  const input: ModelInputNode = { id: 'input', type: 'model-input', position: result.position, data: {
    model: 'zenmux', parameter: 'provider', options: ['openai', 'zenmux', 'apimart'],
  } };
  const edges = [
    { id: 'in', source: 'input', target: 'router', targetHandle: 'input' },
    { id: 'out', source: 'router', sourceHandle: 'output', target: connected.id, targetHandle: 'provider' },
  ];
  const saved = workflowSnapshot({
    nodes: [legacy as unknown as SunburstNode, connected, input, { id: 'router', type: 'router', position: result.position, data: {} }],
    edges, viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark',
  });
  for (const item of saved.nodes.slice(0, 2) as SunburstNode[]) {
    assert.equal(item.data.provider, 'apimart');
    assert.equal(item.data.channelModel, 'gpt-image-2.6');
    assert.equal(item.data.size, '1024x1536');
    assert.deepEqual(item.data.results, [asset]);
    assert.equal(item.data.activeResultId, asset.id);
    assert.equal(item.data.exposed, undefined);
  }
  assert.equal((saved.nodes[0] as SunburstNode).data.locked, true);
  assert.deepEqual(saved.nodes[2].data, { ...input.data, model: 'apimart', options: ['openai', 'apimart'] });
  assert.deepEqual(saved.edges, [{ ...edges[0], selected: undefined }]);
  assert.equal(input.data.model, 'zenmux');
  assert.deepEqual(workflowSnapshot(saved), saved);
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

test('invalid legacy parameters do not replace local settings and never retain their edges', () => {
  const input: ModelInputNode = { id: 'bad', type: 'model-input', position: result.position, data: { model: 'unsupported' } };
  const saved = workflowSnapshot({
    nodes: [input, result], edges: [{ id: 'retired', source: input.id, target: result.id, targetHandle: 'quality' }],
    viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark',
  });
  assert.equal((saved.nodes[1] as SunburstNode).data.quality, 'high');
  assert.equal((saved.nodes[1] as SunburstNode).data.exposed, undefined);
  assert.deepEqual(saved.edges, []);
  assert.equal(result.data.exposed?.[0], 'quality');
});

test('legacy Seedream and Nano Banana settings are converted without changing their media and prompt connections', () => {
  const seedream: SeedreamNode = { id: 'seedream', type: 'seedream', position: result.position,
    data: { ...defaultSeedreamSettings, imageInputs: 1, size: '1537x1001', exposed: ['resolution', 'watermark'] } };
  const banana: NanoBananaNode = { id: 'banana', type: 'nano-banana', position: result.position,
    data: { ...defaultNanoBananaSettings, imageInputs: 1, exposed: ['imageSize'] } };
  const source = (id: string, model: string): ModelInputNode => ({ id, type: 'model-input', position: result.position, data: { model } });
  const edges = [
    { id: 'reference', source: file.id, sourceHandle: 'file', target: seedream.id, targetHandle: 'image-0' },
    { id: 'prompt', source: 'text', target: banana.id, targetHandle: 'prompt' },
    { id: 'seedream-tier', source: 'tier', target: seedream.id, targetHandle: 'resolution' },
    { id: 'seedream-mark', source: 'mark', target: seedream.id, targetHandle: 'watermark' },
    { id: 'banana-tier', source: 'tier', target: banana.id, targetHandle: 'imageSize' },
  ];
  const saved = workflowSnapshot({
    nodes: [seedream, banana, file, source('tier', '2K'), source('mark', 'true'),
      { id: 'text', type: 'text', position: result.position, data: { text: 'A fox' } }],
    edges, viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark',
  });
  assert.deepEqual(saved.nodes[0].data, { ...defaultSeedreamSettings, imageInputs: 1, size: '1537x1001', watermark: true });
  assert.deepEqual(saved.nodes[1].data, { ...defaultNanoBananaSettings, imageInputs: 1, imageSize: '2K' });
  assert.deepEqual(saved.edges.map(edge => edge.id), ['reference', 'prompt']);
  assert.equal(saved.nodes.length, 6);
});
