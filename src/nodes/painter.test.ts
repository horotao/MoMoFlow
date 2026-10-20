import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPainterData, painterRevision, restorePainterData } from './painter.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { canConnect } from './connectionRules.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { AppNode, FileAsset, PainterNode } from './types';

const asset = (name: string): FileAsset => ({ id: name, name: `${name}.png`, kind: 'image', url: `blob:${name}` });
const painter: PainterNode = { id: 'paint', type: 'painter', position: { x: 0, y: 0 }, data: { ...defaultPainterData, result: asset('result'), mask: asset('mask'), alphaMask: asset('alpha'), outputRevision: painterRevision(defaultPainterData) } };
const file: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const generator: AppNode = { id: 'generate', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Edit the painted area' } };

test('Painter exposes distinct result and mask; Sunburst receives alpha only for the mask port', () => {
  assert.equal(imageOutput(painter, 'result')[0].id, 'result');
  assert.equal(imageOutput(painter, 'mask')[0].id, 'mask');
  const nodes = [painter, file, generator, prompt];
  const edges = [
    { id: 'prompt', source: prompt.id, target: generator.id, targetHandle: 'prompt' },
    { id: 'image', source: file.id, target: generator.id, targetHandle: 'image-0' },
    { id: 'mask', source: painter.id, sourceHandle: 'mask', target: generator.id, targetHandle: 'mask' },
  ];
  const run = prepareSunburstRun(nodes, edges, [generator.id], 1);
  assert.equal(run.error, undefined);
  assert.equal(run.tasks[0].imageRequest?.mask, 'blob:alpha');
  assert.deepEqual(run.tasks[0].imageRequest?.images, ['blob:input']);
});

test('output is unavailable after upstream replacement, disconnect or unrendered edits', () => {
  const edge = { id: 'in', source: file.id, target: painter.id, targetHandle: 'image' };
  assert.deepEqual(imageOutput(painter, 'result', [painter, file], [edge]), []);
  const ready = { ...painter, data: { ...painter.data, outputRevision: painterRevision(painter.data, 'input') } };
  assert.equal(imageOutput(ready, 'mask', [ready, file], [edge])[0].id, 'mask');
  assert.deepEqual(imageOutput(ready, 'mask', [ready, file], []), []);
  const changed = { ...painter, data: { ...painter.data, background: '#ffffff' } };
  assert.deepEqual(imageOutput(changed, 'result', [changed], []), []);
});

test('Painter input accepts images, rejects text, duplicate inputs, cycles and locked nodes', () => {
  const edge = { id: 'in', source: file.id, sourceHandle: 'file', target: painter.id, targetHandle: 'image' };
  const nodes = [painter, file, prompt];
  assert.equal(canConnect(edge, nodes, []), true);
  assert.equal(canConnect(edge, nodes, [edge]), false);
  assert.equal(canConnect({ ...edge, source: prompt.id }, nodes, []), false);
  assert.equal(canConnect({ ...edge, targetHandle: 'invalid' }, nodes, []), false);
  assert.equal(canConnect(edge, [{ ...painter, data: { ...painter.data, locked: true } }, file], []), false);
  const second = { ...painter, id: 'second' };
  assert.equal(canConnect({ source: second.id, sourceHandle: 'mask', target: painter.id, targetHandle: 'image' }, [painter, second], [{ id: 'cycle', source: painter.id, target: second.id }]), false);
});

test('persistence and resource collection include every Painter output', () => {
  assert.deepEqual([...nodeAssetUrls([painter])], ['blob:result', 'blob:mask', 'blob:alpha']);
  const [mapped] = mapAssets([painter], item => ({ ...item, url: item.url.replace('blob:', 'blob:restored-') }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:restored-result', 'blob:restored-mask', 'blob:restored-alpha']);
  assert.equal(imageOutput(mapped, 'mask', [mapped], [])[0].url, 'blob:restored-mask');
});

test('clipboard validates strokes and dimensions and drops stale derived outputs', () => {
  const restored = restorePainterData(painter.data)!;
  assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined);
  assert.equal(restored.locked, false);
  assert.equal(restorePainterData({ ...painter.data, width: Infinity }), undefined);
  assert.equal(restorePainterData({ ...painter.data, strokes: [{ tool: 'brush', points: [{ x: NaN, y: 0 }] }] }), undefined);
});


test('a detached duplicate keeps its source image and can restore its clipboard data', () => {
  const copied = { ...painter, data: { ...painter.data, baseImage: asset('input'), outputRevision: painterRevision(painter.data, 'input') } };
  assert.equal(imageOutput(copied, 'result', [copied], [])[0].id, 'result');
  assert.ok(nodeAssetUrls([copied]).has('blob:input'));
  assert.equal(restorePainterData(copied.data)?.baseImage?.id, 'input');
  const [mapped] = mapAssets([copied], item => ({ ...item, url: item.url + '-restored' }));
  assert.ok(nodeAssetUrls([mapped]).has('blob:input-restored'));
});
