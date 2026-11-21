import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAssets, workflowSnapshot, WorkflowStorage, type Workflow } from './workflowStorage.ts';
import { prepareModel } from '../nodes/executionGraph.ts';
import { isCanvasImageNode } from '../nodes/types.ts';
import type { FileAsset, FileNode, SunburstNode, TextNode } from '../nodes/types';

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

test('a mixed project migrates prompts, media, model results and reference wires to Image', () => {
  const retired = { id: 'obsolete', type: 'ideogram', position: file.position, data: { results: [{ ...asset, url: 'blob:missing' }] } };
  const secondImage = { ...asset, id: 'second', url: 'blob:second' };
  const video = { ...asset, id: 'video', kind: 'video' as const };
  const mixedFile = { ...file, data: { ...file.data, assets: [asset, secondImage, video], activeAssetId: secondImage.id } };
  const prompt: TextNode = { id: 'prompt', type: 'text', position: { x: 2, y: 4 }, data: { text: '旧项目提示词' } };
  const standalone: TextNode = { ...prompt, id: 'standalone', data: { text: '独立草稿' } };
  const legacy: SunburstNode = { ...result, id: 'old-gpt', data: { ...result.data, composer: undefined, size: '1536x864' } };
  const edges = [
    { id: 'prompt-wire', source: prompt.id, sourceHandle: null, target: legacy.id, targetHandle: 'prompt' },
    { id: 'file-wire', source: file.id, sourceHandle: 'file', target: legacy.id, targetHandle: 'image-0' },
    { id: 'result-wire', source: legacy.id, sourceHandle: 'result', target: result.id, targetHandle: 'image-0' },
    { id: 'mask-wire', source: file.id, sourceHandle: 'file', target: legacy.id, targetHandle: 'mask' },
    { id: 'retired-wire', source: retired.id, sourceHandle: 'result', target: legacy.id, targetHandle: 'image-1' },
  ];
  const original: Workflow = { nodes: [prompt, mixedFile, legacy, retired as unknown as Workflow['nodes'][number], result, standalone],
    edges, colorMode: 'dark', viewport: { x: 3, y: 4, zoom: 0.8 } };
  const saved = workflowSnapshot(original);
  assert.deepEqual(saved.nodes.map(node => node.id), [file.id, legacy.id, result.id, standalone.id]);
  assert.deepEqual(saved.edges.map(edge => [edge.id, edge.sourceHandle, edge.targetHandle]),
    [['result-wire', 'result', 'image-0'], ['file-wire', 'result', 'image-0']]);
  const [media, model, current, draft] = saved.nodes;
  assert.ok(isCanvasImageNode(media) && isCanvasImageNode(model) && isCanvasImageNode(current) && isCanvasImageNode(draft));
  assert.deepEqual(media.data.results, [asset, secondImage]);
  assert.equal(media.data.activeResultId, secondImage.id);
  assert.equal(media.data.locked, true);
  assert.deepEqual(model.position, legacy.position);
  assert.deepEqual(model.data.results, [asset]);
  assert.equal(model.data.composer.prompt, prompt.data.text);
  assert.equal(model.data.composer.ratio, '16:9');
  const expectedCurrent = { ...result.data };
  delete expectedCurrent.exposed;
  assert.deepEqual(current.data, expectedCurrent);
  assert.equal(draft.data.composer.prompt, '独立草稿');
  const request = prepareModel(saved, model.id)[0].imageRequest;
  assert.equal(request?.prompt, '旧项目提示词');
  assert.deepEqual(request?.images, ['blob:second']);
  assert.deepEqual(saved.viewport, original.viewport);
  assert.deepEqual(workflowSnapshot(saved), saved);
  assert.equal(original.nodes.length, 6);
  assert.equal(original.edges[1].sourceHandle, 'file');
});

test('migration keeps valid new wires first and flattens children of retired groups', () => {
  const group = { id: 'group', type: 'group' as const, position: { x: 200, y: 300 }, data: {} };
  const upstream = { ...result, id: 'upstream', parentId: group.id, position: { x: 12, y: 20 } };
  const saved = workflowSnapshot({
    nodes: [group, upstream, file, result],
    edges: [
      { id: 'new', source: upstream.id, sourceHandle: 'result', target: result.id, targetHandle: 'image-0' },
      { id: 'occupied', source: file.id, sourceHandle: 'file', target: result.id, targetHandle: 'image-0' },
      { id: 'migrated', source: file.id, sourceHandle: 'file', target: result.id, targetHandle: 'image-1' },
      { id: 'duplicate', source: file.id, sourceHandle: 'file', target: result.id, targetHandle: 'image-2' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark',
  });
  assert.deepEqual(saved.nodes[0].position, { x: 212, y: 320 });
  assert.equal(saved.nodes[0].parentId, undefined);
  assert.deepEqual(saved.edges.map(edge => edge.id), ['new', 'migrated']);
});
