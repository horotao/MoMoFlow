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
  ['sunburst', 'image-0'], ['sunburst', 'mask'], ['nano-banana', 'image-0', { imageInputs: 2 }],
];
for (const [type, handle, data] of imageInputs) test(`${type} ${handle} replaces its occupied input and preserves other edges`, () => {
  const nodes = [image('old'), image('new'), node(type, 'target', data), node('sunburst', 'other')];
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
    ['text', 'variable-1'], ['text', 'variable-2'], ['sunburst', 'prompt'],
    ['nano-banana', 'prompt'],
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
  const nodes = [image('old'), image('new'), text('text'), node('sunburst', 'target'), node('sunburst', 'downstream')];
  const previous = edge('old', 'target', 'image-0');
  const next = edge('target', 'downstream', 'image-0', 'result');
  const edges = [previous, next];
  for (const connection of [edge('text', 'target', 'image-0', null), edge('target', 'target', 'image-0', 'result'),
    edge('downstream', 'target', 'image-0', 'result'), edge('new', 'target', 'wrong')]) {
    assert.equal(replace(connection, nodes, edges), edges);
  }
  for (const id of ['new', 'target']) {
    const locked = nodes.map(item => item.id === id ? { ...item, data: { ...item.data, locked: true } } as AppNode : item);
    assert.equal(replace(edge('new', 'target', 'image-0'), locked, edges), edges);
  }
});

test('reverse creation on an occupied image input retains Import recommendations and pending-import validation', () => {
  const nodes = [image('old'), node('sunburst', 'preview'), node('file', 'new')];
  const previous = edge('old', 'preview', 'image-0');
  const pending = { nodeId: 'preview', handleId: 'image-0', direction: 'target' as const, position, screen: position };
  const choice = connectionChoices(pending, nodes, [previous]).find(choice => choice.itemId === 'file')!;
  assert.ok(choice);
  const connection = choiceConnection(pending, choice, 'new');
  assert.equal(canConnect(connection, nodes, [previous]), false);
  assert.equal(canConnect(connection, nodes, [previous], 'new'), true);
  assert.deepEqual(withoutReplacedInput(connection, nodes, [previous]), []);
});
