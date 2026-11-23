import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Node } from '@xyflow/react';
import { arrangeSelectedNodes, canArrangeSelectedNodes, isArrangeShortcut } from './canvasLayout.ts';
const node = (id: string, x = 11, y = 17, extra: Partial<Node<{ locked?: boolean }>> = {}): Node<{ locked?: boolean }> => ({ id, position: { x, y }, data: {}, selected: true, measured: { width: 180, height: 120 }, ...extra });
test('only selected unlocked top-level nodes move; empty and single selection are no-ops', () => {
  const nodes = [node('a', 11, 17, { selected: false }), node('b')];
  assert.equal(arrangeSelectedNodes(nodes, []), nodes);
  const locked = node('locked', -900, -900, { data: { locked: true } });
  const nested = node('nested', 0, 0, { parentId: 'a' });
  const all = [...nodes, node('c'), locked, nested];
  const next = arrangeSelectedNodes(all, []);
  assert.equal(next[0], nodes[0]); assert.equal(next[3], locked); assert.equal(next[4], nested);
  assert.equal(next[1].data, nodes[1].data);
});
test('connected nodes follow dependencies with measured dimensions and stable repeat', () => {
  const nodes = [node('a', 900, 300), node('b', -20, 200), node('c', 140, -40)];
  const edges = [{ source: 'c', target: 'b' }, { source: 'b', target: 'a' }];
  const next = arrangeSelectedNodes(nodes, edges);
  assert.ok(next[2].position.x + 180 < next[1].position.x);
  assert.ok(next[1].position.x + 180 < next[0].position.x);
  assert.equal(arrangeSelectedNodes(next, edges), next);
});
test('cycles terminate, isolated nodes stay fixed and connected grid positions align', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => node(id));
  const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'a', target: 'a' }];
  const next = arrangeSelectedNodes(nodes, edges, 0.5);
  for (let i = 2; i < nodes.length; i++) assert.equal(next[i], nodes[i]);
  for (const n of next.slice(0, 2)) for (const value of Object.values(n.position)) assert.equal((value - 0.5) % 32, 0);
  assert.equal(arrangeSelectedNodes(next, edges, 0.5), next);
});
test('fixed obstacles are preserved and layout moves clear without drifting on repeat', () => {
  const obstacle = node('fixed', 11, 17, { selected: false, measured: { width: 400, height: 400 } });
  const nodes = [node('a'), node('b'), obstacle];
  const edges = [{ source: 'a', target: 'b' }];
  const next = arrangeSelectedNodes(nodes, edges);
  assert.equal(next[2], obstacle);
  assert.equal(next[0].position.y, -167);
  assert.equal(next[0].position.x, 11);
  assert.equal(arrangeSelectedNodes(next, edges), next);
});
test('dragging is a no-op and hidden nodes stay fixed', () => {
  const nodes = [node('a'), node('b', 0, 0, { dragging: true })];
  assert.equal(arrangeSelectedNodes(nodes, []), nodes);
  const hidden = node('hidden', 0, 0, { hidden: true });
  assert.equal(arrangeSelectedNodes([node('a'), node('b'), hidden], [])[2], hidden);
});
test('shortcut requires Shift L alone, without repeats, IME or handled events', () => {
  const event = { key: 'L', shiftKey: true, metaKey: false, ctrlKey: false, altKey: false, repeat: false, isComposing: false, defaultPrevented: false };
  assert.ok(isArrangeShortcut(event)); assert.ok(isArrangeShortcut({ ...event, key: 'l' }));
  for (const key of ['metaKey', 'ctrlKey', 'altKey', 'repeat', 'isComposing', 'defaultPrevented']) assert.equal(isArrangeShortcut({ ...event, [key]: true }), false);
  assert.equal(isArrangeShortcut({ ...event, shiftKey: false }), false);
});

test('separate workflows retain their own horizontal and vertical areas; isolated selection stays exact', () => {
  const nodes = [node('a', 20, 30), node('b', 100, 80), node('c', 1800, 900), node('d', 1900, 980), node('loose', 777.3, 666.9)];
  const edges = [{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }];
  const next = arrangeSelectedNodes(nodes, edges);
  assert.deepEqual(next[0].position, { x: 20, y: 30 });
  assert.deepEqual(next[2].position, { x: 1800, y: 900 });
  assert.equal(next[4], nodes[4]);
  assert.equal(arrangeSelectedNodes(next, edges), next);
});
test('overlapping groups use nearest clearance, not global packing, and remain stable', () => {
  const nodes = [node('a', 0, 0), node('b', 40, 10), node('c', 0, 150), node('d', 40, 160)];
  const edges = [{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }];
  const next = arrangeSelectedNodes(nodes, edges);
  assert.deepEqual(next[0].position, { x: 0, y: 0 });
  assert.deepEqual(next[2].position, { x: 0, y: 184 });
  assert.equal(arrangeSelectedNodes(next, edges), next);
});
test('entirely disconnected selection is a no-op even with grid snapping', () => {
  const nodes = [node('a', 1.1, 2.2), node('b', 3.3, 4.4)];
  assert.equal(arrangeSelectedNodes(nodes, [], 0.5), nodes);
});

test('the arrange button requires a link between two eligible selected nodes', () => {
  const a = node('a');
  const b = node('b');
  const link = [{ source: 'a', target: 'b' }];
  assert.ok(canArrangeSelectedNodes([a, b], link));
  assert.equal(canArrangeSelectedNodes([a, b], []), false);
  for (const changes of [{ selected: false }, { data: { locked: true } }, { hidden: true }, { parentId: 'a' }, { dragging: true }]) {
    assert.equal(canArrangeSelectedNodes([a, { ...b, ...changes }], link), false);
  }
});
