import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, SunburstNode } from './types';
import { connectionChoices, choiceConnection, initializeConnectionParameter, type PendingConnection } from './connectionRecommendations.ts';
import { canConnect } from './connectionRules.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { prepareSunburstRun } from './sunburstRun.ts';

const text: AppNode = { id: 'text', type: 'text', position: { x: 0, y: 0 }, data: { text: '' } };
const image: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [{ id: 'a', name: 'a.png', url: 'blob:a', kind: 'image' }] } };
const generator: SunburstNode = { id: 'generator', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
function pending(nodeId: string, direction: 'source' | 'target' = 'source', handleId: string | null = null): PendingConnection {
  return { nodeId, direction, handleId, screen: { x: 400, y: 300 }, position: { x: 200, y: 150 } };
}

test('text and image outputs recommend compatible implemented inputs with stable handle IDs', () => {
  assert.deepEqual(connectionChoices(pending('text'), [text], []).map(c => [c.itemId, c.handleId]), [
    ['text', 'variable-1'], ['sunburst', 'prompt'], ['image-describer', 'instructions'],
  ]);
  assert.deepEqual(connectionChoices(pending('image', 'source', 'file'), [image], []).map(c => [c.itemId, c.handleId]), [
    ['compositor', 'background'], ['compositor', 'layer-1'], ['preview', 'file'], ['image-describer', 'image-0'], ['sunburst', 'image-0'], ['painter', 'image'], ['resize', 'image'], ['rotate-flip', 'image'], ['invert', 'image'], ['levels', 'image'], ['blur', 'image'], ['crop', 'image'], ['color-correction', 'file'],
  ]);
  assert.deepEqual(connectionChoices(pending('generator', 'source', 'result'), [generator], []).map(c => c.itemId), ['compositor', 'compositor', 'preview', 'image-describer', 'sunburst', 'painter', 'resize', 'rotate-flip', 'invert', 'levels', 'blur', 'crop', 'color-correction']);
});

test('non-image and empty files never suggest incompatible text or image consumers', () => {
  for (const data of [{}, { assets: [{ id: 'v', name: 'v.mp4', url: 'blob:v', kind: 'video' as const }] }]) {
    assert.deepEqual(connectionChoices(pending('file'), [{ id: 'file', type: 'file', position: { x: 0, y: 0 }, data }], []), []);
  }
});

test('reverse image and mask connections retain the exact target handle and offer Import', () => {
  for (const handle of ['image-0', 'mask']) {
    const start = pending('generator', 'target', handle);
    const choices = connectionChoices(start, [generator], []);
    assert.deepEqual(choices.map(c => c.itemId), ['file', 'color-palette', 'compositor', 'sunburst', 'painter', 'resize', 'rotate-flip', 'invert', 'levels', 'blur', 'crop', 'color-correction']);
    assert.deepEqual(choiceConnection(start, choices[0], 'new'), { source: 'new', sourceHandle: 'file', target: 'generator', targetHandle: handle });
    const empty: AppNode = { id: 'new', type: 'file', position: { x: 0, y: 0 }, data: {} };
    const connection = choiceConnection(start, choices[0], 'new');
    assert.equal(canConnect(connection, [generator, empty], []), false);
    assert.equal(canConnect(connection, [generator, empty], [], 'new'), true);
  }
});

test('reverse text ports offer text producers, unavailable inputs and stale starts offer none', () => {
  assert.deepEqual(connectionChoices(pending('generator', 'target', 'prompt'), [generator], []).map(c => c.itemId), ['text', 'model-input', 'image-describer', 'color-palette']);
  assert.deepEqual(connectionChoices(pending('generator', 'target', 'quality'), [generator], []), []);
  assert.deepEqual(connectionChoices(pending('gone'), [text], []), []);
  assert.deepEqual(connectionChoices(pending('text'), [{ ...text, data: { text: '', locked: true } }], []), []);
  const occupied = { id: 'edge', source: 'other', target: 'text', targetHandle: 'variable-3' };
  assert.deepEqual(connectionChoices(pending('text', 'target', 'variable-3'), [text], [occupied]), []);
  assert.ok(connectionChoices(pending('text', 'target', 'variable-4'), [text], [occupied]).length);
});

test('shared validator preserves occupied inputs, cycles, locked nodes and image/text restrictions', () => {
  const edge = { id: 'edge', source: 'text', sourceHandle: null, target: 'generator', targetHandle: 'prompt' };
  assert.equal(canConnect(edge, [text, generator], []), true);
  assert.equal(canConnect(edge, [text, generator], [edge]), false);
  assert.equal(canConnect(edge, [{ ...text, data: { text: '', locked: true } }, generator], []), false);
  assert.equal(canConnect({ ...edge, source: 'image', sourceHandle: 'file' }, [image, generator], []), false);
  const second = { ...text, id: 'second' };
  assert.equal(canConnect({ source: 'second', target: 'text', sourceHandle: null, targetHandle: 'variable-1' }, [text, second], [{ id: 'cycle', source: 'text', target: 'second' }]), false);
});

test('reverse parameter creation preserves all Sunburst values and produces a valid request', () => {
  const fields = { quality: 'high', background: 'opaque', size: '2048x2048', outputFormat: 'webp' } as const;
  const target: SunburstNode = { ...generator, data: { ...generator.data, ...fields, exposed: ['quality', 'background', 'size', 'outputFormat'] } };
  const prompt = { ...text, data: { text: 'An apple' } };
  const nodes: AppNode[] = [target, prompt];
  const edges: Edge[] = [{ id: 'prompt', source: prompt.id, target: target.id, sourceHandle: null, targetHandle: 'prompt' }];
  for (const field of target.data.exposed!) {
    const start = pending(target.id, 'target', field);
    const choice = connectionChoices(start, nodes, edges).find(item => item.itemId === 'model-input')!;
    assert.ok(choice);
    const created: AppNode = { id: field, type: 'model-input', position: start.position, data: { model: 'deepseek-flash' } };
    const node = initializeConnectionParameter(created, start, nodes);
    assert.equal(node.type, 'model-input');
    if (node.type !== 'model-input' || !('model' in node.data)) throw new Error('Expected parameter node');
    assert.equal(node.data.model, fields[field]);
    assert.equal(node.data.parameter, field);
    assert.ok(node.data.options?.includes(fields[field]));
    assert.equal(node.data.options?.includes('deepseek-flash'), false);
    const connection = choiceConnection(start, choice, node.id);
    assert.equal(canConnect(connection, [...nodes, node], edges), true);
    nodes.push(node);
    edges.push({ id: field, ...connection });
  }
  const run = prepareSunburstRun(nodes, edges, [target.id], 1);
  assert.equal(run.error, undefined);
  assert.equal(run.tasks.length, 1);
  for (const field of target.data.exposed!) assert.equal(run.tasks[0].imageRequest?.[field], fields[field]);
});

test('parameter initialization leaves ordinary model nodes and other recommendations unchanged', () => {
  const model: AppNode = { id: 'model', type: 'model-input', position: { x: 0, y: 0 }, data: { model: 'deepseek-flash' } };
  for (const start of [pending(generator.id, 'target', 'prompt'), pending(generator.id, 'target', 'quality'), pending(text.id, 'target', 'variable-1'), pending(generator.id, 'source', 'result')]) {
    assert.equal(initializeConnectionParameter(model, start, [generator, text]), model);
  }
  const target: SunburstNode = { ...generator, data: { ...generator.data, exposed: ['quality'] } };
  assert.equal(initializeConnectionParameter(text, pending(target.id, 'target', 'quality'), [target]), text);
});
