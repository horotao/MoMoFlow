import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppNode, ImageDescriberNode } from './types';
import { prepareDescriberRun } from './describerRun.ts';

const describer = (id: string, locked = false): ImageDescriberNode => ({ id, type: 'image-describer', position: { x: 0, y: 0 }, selected: true, data: { model: id, instructions: '', text: '', imageInputs: 1, locked } });
const image: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [{ id: 'asset', name: 'test', url: 'blob:local', kind: 'image' }] } };
const edges = ['a', 'b'].map((id) => ({ id, source: 'file', target: id, targetHandle: 'image-0' }));
test('multi-selection creates runs for every node in one batch using each effective model', () => {
  const nodes = [image, describer('a'), describer('b'), { id: 'model', type: 'model-input' as const, position: { x: 0, y: 0 }, data: { model: 'external-model' } }];
  const result = prepareDescriberRun(nodes, [...edges, { id: 'model-edge', source: 'model', target: 'b', targetHandle: 'model' }], ['a', 'b', 'a'], 2);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.tasks.map((task) => [task.nodeId, task.model]), [['a', 'a'], ['a', 'a'], ['b', 'external-model'], ['b', 'external-model']]);
  assert.equal(new Set(result.tasks.map((task) => task.batchId)).size, 1);
  assert.equal(new Set(result.tasks.map((task) => task.id)).size, 4);
});
test('locked and missing nodes cannot enqueue tasks, unlocked selections still run', () => {
  const nodes = [image, describer('a', true), describer('b')];
  assert.deepEqual(prepareDescriberRun(nodes, edges, ['a', 'missing'], 1).tasks, []);
  assert.deepEqual(prepareDescriberRun(nodes, edges, ['a', 'b'], 1).tasks.map((task) => task.nodeId), ['b']);
});
test('invalid selection fails validation before any partial batch is queued', () => {
  const nodes = [image, describer('a'), describer('b')];
  const result = prepareDescriberRun(nodes, edges.slice(0, 1), ['a', 'b'], 1);
  assert.match(result.error ?? '', /image/);
  assert.deepEqual(result.tasks, []);
});
