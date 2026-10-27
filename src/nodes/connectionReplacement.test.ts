import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, type Edge } from '@xyflow/react';
import { canConnect, withoutReplacedInput } from './connectionRules.ts';
import { connectionChoices, choiceConnection } from './connectionRecommendations.ts';
import type { AppNode } from './types';

const position = { x: 0, y: 0 };
const node = (type: string, id: string, data: Record<string, unknown> = {}): AppNode => ({ id, type, position, data } as AppNode);
const image = (id: string) => node('file', id, { assets: [{ id, kind: 'image', name: `${id}.png`, url: `blob:${id}` }] });
const text = (id: string) => node('text', id, { text: id });
const edge = (source: string, target: string, targetHandle: string | null, sourceHandle: string | null = 'file'): Edge => ({ id: `${source}-${target}-${targetHandle}`, source, ...(sourceHandle ? { sourceHandle } : {}), target, targetHandle });
const replace = (connection: Edge, nodes: AppNode[], edges: Edge[]) => canConnect(connection, nodes, edges)
  ? addEdge(connection, withoutReplacedInput(connection, nodes, edges)) : edges;

const imageInputs: [string, string, Record<string, unknown>?][] = [
  ...['painter', 'masks-extractor', 'crop', 'blur', 'levels', 'invert', 'rotate-flip', 'resize'].map(type => [type, 'image'] as [string, string]),
  ['color-correction', 'file'], ['preview', 'file'], ['blend', 'back'], ['blend', 'front'],
  ['compare', 'input-1'], ['compare', 'input-2'], ['router', 'input'],
  ['compositor', 'background', { document: { inputs: [{ id: 'background' }, { id: 'layer-1' }] } }],
  ['compositor', 'layer-1', { document: { inputs: [{ id: 'background' }, { id: 'layer-1' }] } }],
  ['sunburst', 'image-0'], ['sunburst', 'mask'], ['nano-banana', 'image-0', { imageInputs: 2 }],
  ['image-describer', 'image-0'],
];
for (const [type, handle, data] of imageInputs) test(`${type} ${handle} replaces its occupied input and preserves other edges`, () => {
  const nodes = [image('old'), image('new'), node(type, 'target', data), node('preview', 'other')];
  const previous = edge('old', 'target', handle);
  const sibling = edge('old', 'target', 'unrelated-input');
  const branch = edge('old', 'other', 'file');
  const edges = [previous, sibling, branch];
  const connection = edge('new', 'target', handle);
  assert.equal(canConnect(connection, nodes, edges), true);
  assert.deepEqual(replace(connection, nodes, edges), [sibling, branch, connection]);
  assert.deepEqual(edges, [previous, sibling, branch], 'validation/replacement must not mutate the original graph');
  assert.equal(canConnect(previous, nodes, edges), false, 'identical connection is a no-op');
});

test('text, model and variable inputs replace per port, including legacy first-variable handles', () => {
  const cases: [string, string, Record<string, unknown>?][] = [
    ['text', 'variable-1'], ['text', 'variable-2'], ['router', 'input'], ['sunburst', 'prompt'],
    ['sunburst', 'quality', { exposed: ['quality'] }], ['nano-banana', 'prompt'],
    ['nano-banana', 'aspectRatio', { exposed: ['aspectRatio'] }],
    ['image-describer', 'model'], ['image-describer', 'instructions'],
  ];
  for (const [type, handle, data] of cases) {
    const nodes = [text('old'), text('new'), node(type, 'target', data)];
    const previous = edge('old', 'target', handle, null), connection = edge('new', 'target', handle, null);
    assert.deepEqual(replace(connection, nodes, [previous]), [connection], `${type} ${handle}`);
  }
  const nodes = [text('old'), text('new'), text('target')];
  const legacy = edge('old', 'target', null, null), second = edge('old', 'target', 'variable-2', null);
  const connection = edge('new', 'target', 'variable-1', null);
  assert.deepEqual(replace(connection, nodes, [legacy, second]), [second, connection]);
  assert.equal(canConnect({ ...connection, source: 'old', sourceHandle: undefined }, nodes, [legacy]), false);
});

test('invalid replacements preserve the graph: types, locks, self-links, cycles and unknown handles', () => {
  const nodes = [image('old'), image('new'), text('text'), node('resize', 'target'), node('resize', 'downstream')];
  const previous = edge('old', 'target', 'image');
  const next = edge('target', 'downstream', 'image', 'result');
  const edges = [previous, next];
  for (const connection of [edge('text', 'target', 'image', null), edge('target', 'target', 'image', 'result'),
    edge('downstream', 'target', 'image', 'result'), edge('new', 'target', 'wrong')]) {
    assert.equal(replace(connection, nodes, edges), edges);
  }
  for (const id of ['new', 'target']) {
    const locked = nodes.map(item => item.id === id ? { ...item, data: { ...item.data, locked: true } } as AppNode : item);
    assert.equal(replace(edge('new', 'target', 'image'), locked, edges), edges);
  }
});

test('Router outputs replace occupied consumers and Router input replacement still validates downstream types', () => {
  const nodes = [image('old'), image('new'), text('text'), node('router', 'router'), node('preview', 'preview'), text('consumer')];
  const input = edge('new', 'router', 'input');
  const previous = edge('old', 'preview', 'file');
  const replacement = edge('router', 'preview', 'file', 'output');
  assert.deepEqual(replace(replacement, nodes, [input, previous]), [input, replacement]);
  assert.equal(canConnect(edge('text', 'router', 'input', null), nodes, [input, replacement]), false);
  const branch = edge('router', 'consumer', 'variable-1', 'output');
  assert.equal(canConnect(edge('new', 'router', 'input'), nodes, [edge('text', 'router', 'input', null), branch]), false);
});

test('changing output handles on the same source replaces instead of accumulating edges', () => {
  const nodes = [node('painter', 'painter'), node('preview', 'preview')];
  const previous = edge('painter', 'preview', 'file', 'result'), mask = edge('painter', 'preview', 'file', 'mask');
  assert.deepEqual(replace(mask, nodes, [previous]), [mask]);
});

test('reverse creation on an occupied image input retains Import recommendations and pending-import validation', () => {
  const nodes = [image('old'), node('preview', 'preview'), node('file', 'new')];
  const previous = edge('old', 'preview', 'file');
  const pending = { nodeId: 'preview', handleId: 'file', direction: 'target' as const, position, screen: position };
  const choice = connectionChoices(pending, nodes, [previous]).find(choice => choice.itemId === 'file')!;
  assert.ok(choice);
  const connection = choiceConnection(pending, choice, 'new');
  assert.equal(canConnect(connection, nodes, [previous]), false);
  assert.equal(canConnect(connection, nodes, [previous], 'new'), true);
  assert.deepEqual(withoutReplacedInput(connection, nodes, [previous]), []);
});
