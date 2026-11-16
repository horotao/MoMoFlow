import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, IdeogramNode } from './types';
import { defaultIdeogramSettings } from './ideogram.ts';
import { imageOutput } from './sunburstRun.ts';
import { canConnect } from './connectionRules.ts';
import { extractFileAsset } from './fileCollection.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { mapAssets, workflowSnapshot } from '../persistence/workflowStorage.ts';
import { restoreIdeogramData } from './ideogramClipboard.ts';
import { outputKind } from './router.ts';

const asset: FileAsset = { id: 'a', name: 'a.png', kind: 'image', url: 'blob:a', width: 16, height: 9 };
const generator: IdeogramNode = { id: 'ideogram', type: 'ideogram', position: { x: 0, y: 0 }, data: { ...defaultIdeogramSettings, imageInputs: 0 } };
const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Make a poster' } };
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset] } };
const nodes = [generator, prompt, file];

test('retired Ideogram ports retain image output and reject new inputs', () => {
  for (const targetHandle of ['image-0', 'mask']) assert.equal(canConnect({ source: file.id, sourceHandle: 'file', target: generator.id, targetHandle }, nodes, []), false);
  assert.equal(canConnect({ source: prompt.id, sourceHandle: null, target: generator.id, targetHandle: 'prompt' }, nodes, []), false);
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const route: Edge = { id: 'router', source: generator.id, sourceHandle: 'result', target: router.id, targetHandle: 'input' };
  assert.equal(canConnect(route, [...nodes, router], []), true);
  assert.equal(canConnect({ source: router.id, sourceHandle: 'output', target: preview.id, targetHandle: 'file' }, [...nodes, router, preview], [route]), true);
  assert.equal(canConnect({ source: generator.id, sourceHandle: 'wrong', target: preview.id, targetHandle: 'file' }, [...nodes, preview], []), false);
  assert.equal(outputKind(generator, 'result'), 'image');
});

test('existing retired inputs do not prevent edits to active Router branches', () => {
  const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const nodesWithRouter = [...nodes, router];
  const legacy: Edge = { id: 'retired', source: router.id, sourceHandle: 'output', target: generator.id, targetHandle: 'prompt' };
  assert.equal(canConnect(legacy, nodesWithRouter, []), false);
  assert.equal(canConnect({ source: prompt.id, sourceHandle: null, target: router.id, targetHandle: 'input' }, nodesWithRouter, [legacy]), true);
});

test('Ideogram selected result, extraction, clipboard and persistence preserve assets and settings', () => {
  const second = { ...asset, id: 'b', url: 'blob:b' };
  const generated: IdeogramNode = { ...generator, data: { ...generator.data, label: 'My poster', results: [asset, second], activeResultId: asset.id, exposed: ['resolution'] } };
  assert.deepEqual(imageOutput(generated, 'result'), [asset]);
  assert.deepEqual([...nodeAssetUrls([generated])], ['blob:a', 'blob:b']);
  const mapped = mapAssets([generated], item => ({ ...item, url: `blob:restored-${item.id}` }))[0] as IdeogramNode;
  assert.equal(mapped.data.results?.[0].url, 'blob:restored-a');
  const copy = restoreIdeogramData(generated.data)!;
  assert.equal(copy.label, 'My poster'); assert.equal(copy.activeResultId, asset.id); assert.equal(copy.exposed, undefined); assert.equal(copy.imageInputs, 1);
  const extracted = extractFileAsset([generated], generated.id, asset.id, { x: 20, y: 30 }, 'new-file');
  assert.equal((extracted[0] as IdeogramNode).data.activeResultId, second.id);
  const snapshot = workflowSnapshot({ nodes: [{ ...generated, selected: true }], edges: [], viewport: { x: 1, y: 2, zoom: .5 }, colorMode: 'dark' });
  assert.equal(snapshot.nodes[0].selected, undefined); assert.deepEqual(snapshot.nodes[0].data, generated.data);
});
