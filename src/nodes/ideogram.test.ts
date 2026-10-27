import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, IdeogramNode } from './types';
import { defaultIdeogramSettings, ideogramModel, ideogramParameterData } from './ideogram.ts';
import { prepareIdeogramRun } from './ideogramRun.ts';
import { imageOutput } from './sunburstRun.ts';
import { canConnect, withoutReplacedInput } from './connectionRules.ts';
import { connectionChoices, initializeConnectionParameter, type PendingConnection } from './connectionRecommendations.ts';
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
const edges: Edge[] = [{ id: 'p', source: prompt.id, target: generator.id, targetHandle: 'prompt' }];

test('Ideogram snapshots connected text and parameters, including false, and deduplicates node IDs', () => {
  const parameter: AppNode = { id: 'param', type: 'model-input', position: { x: 0, y: 0 }, data: ideogramParameterData('enablePromptExpansion', 'false') };
  const result = prepareIdeogramRun([...nodes, parameter], [...edges, { id: 'r', source: parameter.id, target: generator.id, targetHandle: 'enablePromptExpansion' }], [generator.id, generator.id], 2);
  assert.equal(result.error, undefined); assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].model, ideogramModel);
  assert.deepEqual(result.tasks[0].ideogramRequest, { ...defaultIdeogramSettings, prompt: prompt.data.text, enablePromptExpansion: false });
  assert.notEqual(result.tasks[0].id, result.tasks[1].id);
  assert.equal(result.tasks[0].batchId, result.tasks[1].batchId);
  (prompt.data as { text: string }).text = 'Changed';
  assert.equal(result.tasks[0].ideogramRequest?.prompt, 'Make a poster');
});

test('empty/long prompts, invalid parameters and run counts block submission; locked nodes skip', () => {
  for (const runs of [0, 11, 1.5]) assert.ok(prepareIdeogramRun(nodes, edges, [generator.id], runs).error);
  assert.ok(prepareIdeogramRun(nodes, [], [generator.id], 1).error);
  for (const text of [' ', 'a'.repeat(10001)]) assert.ok(prepareIdeogramRun([generator, { ...prompt, data: { text } }], edges, [generator.id], 1).error);
  const parameter: AppNode = { id: 'param', type: 'text', position: { x: 0, y: 0 }, data: { text: 'yes' } };
  assert.ok(prepareIdeogramRun([...nodes, parameter], [...edges, { id: 'invalid', source: 'param', target: generator.id, targetHandle: 'enablePromptExpansion' }], [generator.id], 1).error);
  assert.equal(prepareIdeogramRun([{ ...generator, data: { ...generator.data, locked: true } }, prompt], edges, [generator.id], 1).tasks.length, 0);
});

test('Ideogram accepts text, original image and mask inputs, exposes typed parameters and produces images through Router', () => {
  assert.equal(canConnect(edges[0], nodes, []), true);
  for (const targetHandle of ['image-1', 'quality', 'prompt']) assert.equal(canConnect({ source: file.id, sourceHandle: 'file', target: generator.id, targetHandle }, nodes, []), false);
  for (const targetHandle of ['image-0', 'mask']) assert.equal(canConnect({ source: file.id, sourceHandle: 'file', target: generator.id, targetHandle }, nodes, []), true);
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  const router: AppNode = { id: 'router', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const route: Edge = { id: 'router', source: generator.id, sourceHandle: 'result', target: router.id, targetHandle: 'input' };
  assert.equal(canConnect(route, [...nodes, router], []), true);
  assert.equal(canConnect({ source: router.id, sourceHandle: 'output', target: preview.id, targetHandle: 'file' }, [...nodes, router, preview], [route]), true);
  assert.equal(canConnect({ source: generator.id, sourceHandle: 'wrong', target: preview.id, targetHandle: 'file' }, [...nodes, preview], []), false);
  assert.equal(outputKind(generator, 'result'), 'image');
  assert.deepEqual(withoutReplacedInput({ target: generator.id, targetHandle: 'prompt' }, nodes, edges), []);
  const pending: PendingConnection = { nodeId: prompt.id, handleId: null, direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, nodes, []).some(choice => choice.itemId === 'ideogram' && choice.handleId === 'prompt'));
  assert.ok(connectionChoices({ ...pending, nodeId: file.id, handleId: 'file' }, nodes, []).some(choice => choice.itemId === 'ideogram'));
  const exposed: IdeogramNode = { ...generator, data: { ...generator.data, exposed: ['enablePromptExpansion'], enablePromptExpansion: false } };
  assert.equal(canConnect({ ...edges[0], targetHandle: 'enablePromptExpansion' }, [exposed, prompt], []), true);
  const parameter: AppNode = { id: 'param', type: 'model-input', position: { x: 0, y: 0 }, data: { model: '' } };
  assert.deepEqual(initializeConnectionParameter(parameter, { ...pending, nodeId: generator.id, direction: 'target', handleId: 'enablePromptExpansion' }, [exposed]).data, ideogramParameterData('enablePromptExpansion', 'false'));
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
