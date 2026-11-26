import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNodeChanges, type Edge } from '@xyflow/react';
import { duplicateDragChanges, duplicateNodes } from './duplicateNodes.ts';
import type { AppNode, CanvasText } from './types.ts';

const text = (id: string, extra: Partial<CanvasText> = {}): CanvasText => ({
  id, type: 'text', position: { x: 240, y: 160 }, selected: true,
  data: { text: 'Completed result', textComposer: { prompt: '@Image', mentions: [{ nodeId: 'image', from: 0, to: 6 }],
    format: 'md', quantity: 2, selection: { modelIds: ['gpt-6.2-sol'], autoSelect: false, multiple: false } } }, ...extra,
});
const edge: Edge = { id: 'wire', source: 'image', target: 'text', sourceHandle: 'result', targetHandle: 'image-0', data: { mention: true } };
const idFactory = () => { let i = 0; return () => `copy-${++i}`; };

test('duplicates only internal connections and remaps prompt references without sharing mutable data', () => {
  const nodes = [text('image'), text('text'), text('outside')];
  const result = duplicateNodes(nodes, [edge, { ...edge, id: 'out', target: 'outside' }], ['image', 'text'], idFactory());
  assert.equal(result.nodes.length, 2);
  assert.deepEqual(result.edges, [{ ...edge, id: 'copy-3', source: 'copy-1', target: 'copy-2', selected: false }]);
  const copy = result.nodes[1] as CanvasText;
  assert.deepEqual(copy.data.textComposer.mentions, [{ nodeId: 'copy-1', from: 0, to: 6 }]);
  copy.data.textComposer.selection.modelIds.push('other');
  assert.equal(nodes[1].data.textComposer.selection.modelIds.length, 1);
  assert.equal(copy.data.text, 'Completed result');
  assert.equal(copy.dragging, true);
});

test('a single copy retains its content but drops external reference capsules and edges', () => {
  const result = duplicateNodes([text('image'), text('text')], [edge], ['text'], idFactory());
  assert.equal(result.edges.length, 0);
  const copy = result.nodes[0] as CanvasText;
  assert.equal(copy.data.textComposer.prompt, '@Image');
  assert.deepEqual(copy.data.textComposer.mentions, []);
});

test('group duplication includes members once and maps parents and internal wires', () => {
  const group: AppNode = { id: 'group', type: 'canvas-group', position: { x: -100, y: 50 }, width: 1000, height: 600, data: { label: 'Field' } };
  const nodes = [group, text('image', { parentId: 'group' }), text('text', { parentId: 'group' })];
  const result = duplicateNodes(nodes, [edge], ['group'], idFactory());
  assert.equal(result.nodes.length, 3);
  assert.equal(result.nodes[1].parentId, result.nodes[0].id);
  assert.deepEqual(result.nodes[1].position, nodes[1].position);
  assert.equal(result.nodes[1].dragging, false);
  assert.equal(result.nodes[1].selected, false);
  assert.equal(result.edges[0].source, result.nodes[1].id);
  const member = duplicateNodes(nodes, [edge], ['text'], idFactory());
  assert.equal(member.nodes.length, 1);
  assert.equal(member.nodes[0].parentId, 'group');
});

test('locked nodes and groups with locked members cannot start a duplicate drag', () => {
  const locked = text('locked');
  locked.data.locked = true;
  const group: AppNode = { id: 'group', type: 'canvas-group', position: { x: 0, y: 0 }, data: { label: 'Field' } };
  const result = duplicateNodes([group, { ...locked, parentId: 'group' }, text('free')], [], ['group', 'locked', 'free'], idFactory());
  assert.deepEqual([...result.ids.keys()], ['free']);
});

test('dragging moves only copies through reversals and the final position batch', () => {
  const original = text('text');
  const result = duplicateNodes([original], [], ['text'], idFactory());
  let nodes: AppNode[] = [original, ...result.nodes];
  for (const [x, y, dragging] of [[400, 200, true], [180, 120, true], [300, 240, false]] as const) {
    nodes = applyNodeChanges(duplicateDragChanges([{ id: 'text', type: 'position', position: { x, y }, dragging }], result.ids), nodes);
    assert.deepEqual(nodes[0].position, original.position);
    assert.deepEqual(nodes[1].position, { x, y });
    assert.equal(nodes[1].dragging, dragging);
  }
});

test('copied media keeps asset identity and bytes while metadata can be edited independently', () => {
  const video: AppNode = { id: 'video', type: 'video', position: { x: 0, y: 0 }, data: { label: 'Video',
    asset: { id: 'asset', name: 'clip.mp4', url: 'blob:retained-media', kind: 'video' } } };
  const result = duplicateNodes([video], [], ['video'], idFactory());
  assert.deepEqual(result.nodes[0].data, video.data);
  assert.notEqual(result.nodes[0].data, video.data);
});
