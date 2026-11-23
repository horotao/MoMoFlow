import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Node } from '@xyflow/react';
import { alignmentNodeCount, alignSelectedNodes, arrangeSelectedNodes, isArrangeShortcut, type CanvasAlignment } from './canvasLayout.ts';
const node = (id: string, x = 11, y = 17, extra: Partial<Node<{ locked?: boolean }>> = {}): Node<{ locked?: boolean }> => ({ id, position: { x, y }, data: {}, selected: true, measured: { width: 180, height: 120 }, ...extra });

test('aligning uses visible edges and centers and preserves the other axis and per-node origins', () => {
  const nodes = [
    node('a', 10, 30, { measured: { width: 50, height: 80 } }),
    node('b', 200, 110, { measured: { width: 100, height: 40 }, origin: [.5, .5] }),
    node('c', -10, 200, { measured: { width: 30, height: 60 } }),
  ];
  const cases: [CanvasAlignment, number[][]][] = [
    ['left', [[-10, 30], [40, 110], [-10, 200]]],
    ['center', [[95, 30], [120, 110], [105, 200]]],
    ['right', [[200, 30], [200, 110], [220, 200]]],
    ['top', [[10, 30], [200, 50], [-10, 30]]],
    ['middle', [[10, 105], [200, 145], [-10, 115]]],
    ['bottom', [[10, 180], [200, 240], [-10, 200]]],
  ];
  for (const [action, positions] of cases) {
    const aligned = alignSelectedNodes(nodes, action);
    assert.deepEqual(aligned.map(({ position }) => [position.x, position.y]), positions, action);
    assert.equal(alignSelectedNodes(aligned, action), aligned, action);
  }
});

test('distribution equalizes edge gaps with unequal sizes and fixes both end nodes on the requested axis', () => {
  const a = node('a', 10, 20, { measured: { width: 40, height: 50 } });
  const b = node('b', 83, 180, { measured: { width: 20, height: 40 } });
  const c = node('c', 146, 100, { measured: { width: 50, height: 20 } });
  const d = node('d', 300, 310, { measured: { width: 30, height: 80 } });
  const nodes = [c, a, d, b];
  const horizontal = alignSelectedNodes(nodes, 'justifyHorizontal');
  const vertical = alignSelectedNodes(nodes, 'justifyVertical');
  assert.deepEqual(horizontal.map(({ position }) => position), [
    { x: 190, y: 100 }, a.position, d.position, { x: 110, y: 180 },
  ]);
  assert.deepEqual(vertical.map(({ position }) => position), [
    { x: 146, y: 130 }, a.position, d.position, { x: 83, y: 210 },
  ]);
  for (const arranged of [horizontal, vertical]) {
    assert.equal(arranged[1], a);
    assert.equal(arranged[2], d);
  }
  assert.equal(alignSelectedNodes(horizontal, 'justifyHorizontal'), horizontal);
  assert.equal(alignSelectedNodes(vertical, 'justifyVertical'), vertical);
});

test('alignment skips locked, hidden, nested and unselected nodes and honors tool enablement', () => {
  const fixed = [
    node('locked', -100, -100, { data: { locked: true } }),
    node('hidden', -110, -100, { hidden: true }),
    node('nested', -120, -100, { parentId: 'chosen' }),
    node('unselected', -130, -100, { selected: false }),
  ];
  const nodes = [node('chosen', 200, 0), node('reference', 100, 10), ...fixed];
  assert.equal(alignmentNodeCount(nodes), 2);
  assert.equal(alignSelectedNodes(nodes, 'justifyHorizontal'), nodes);
  const aligned = alignSelectedNodes(nodes, 'left');
  assert.equal(aligned[0].position.x, 100);
  fixed.forEach((item, index) => assert.equal(aligned[index + 2], item));
  const dragging = [...nodes, node('dragging', 0, 0, { dragging: true, selected: false })];
  assert.equal(alignmentNodeCount(dragging), 0);
  assert.equal(alignSelectedNodes(dragging, 'left'), dragging);
});
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
test('cycles terminate and both linked and isolated nodes respect grid snapping', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => node(id));
  const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'a', target: 'a' }];
  const next = arrangeSelectedNodes(nodes, edges, 0.5);
  for (const n of next) for (const value of Object.values(n.position)) assert.equal((value - 0.5) % 32, 0);
  assert.ok(next[2].position.y >= next[0].position.y + 120 + 64);
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

test('separate workflows retain their areas and the isolated selection starts below them', () => {
  const nodes = [node('a', 20, 30), node('b', 100, 80), node('c', 1800, 900), node('d', 1900, 980), node('loose', 777.3, 666.9)];
  const edges = [{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }];
  const next = arrangeSelectedNodes(nodes, edges);
  assert.deepEqual(next[0].position, { x: 20, y: 30 });
  assert.deepEqual(next[2].position, { x: 1800, y: 900 });
  assert.deepEqual(next[4].position, { x: 20, y: 1084 });
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
test('two disconnected nodes form one row, and grid snapping applies when enabled', () => {
  const nodes = [node('a', 1.1, 2.2), node('b', 3.3, 4.4)];
  assert.deepEqual(arrangeSelectedNodes(nodes, []).map(item => item.position), [
    { x: 1.1, y: 2.2 }, { x: 245.1, y: 2.2 },
  ]);
  const snapped = arrangeSelectedNodes(nodes, [], 0.5);
  assert.deepEqual(snapped.map(item => item.position), [{ x: .5, y: .5 }, { x: 256.5, y: .5 }]);
  assert.equal(arrangeSelectedNodes(snapped, [], 0.5), snapped);
});

test('disconnected nodes follow visual reading order and fit the largest size in each row and column', () => {
  const nodes = [
    node('a', 670, 100, { measured: { width: 200, height: 160 } }),
    node('b', 140, 420, { measured: { width: 300, height: 100 } }),
    node('c', 400, 100, { measured: { width: 160, height: 120 } }),
    node('d', 250, 620, { measured: { width: 260, height: 220 } }),
    node('e', 120, 310, { measured: { width: 180, height: 140 } }),
  ];
  const cases = [
    [4, [{ x: 534, y: 100 }, { x: 140, y: 324 }, { x: 210, y: 100 }, { x: 504, y: 324 }]],
    [5, [{ x: 514, y: 100 }, { x: 120, y: 324 }, { x: 190, y: 100 }, { x: 484, y: 324 }, { x: 808, y: 100 }]],
  ] as const;
  for (const [count, expected] of cases) {
    const arranged = arrangeSelectedNodes(nodes.slice(0, count), []);
    assert.deepEqual(arranged.map(item => item.position), expected);
    assert.equal(arrangeSelectedNodes(arranged, []), arranged);
  }
});

test('edges to unselected nodes leave the selected nodes eligible for the isolated grid', () => {
  const fixed = node('fixed', 200, 500, { selected: false });
  const nodes = [node('a', 10, 20), node('b', 330, 80), fixed];
  const result = arrangeSelectedNodes(nodes, [{ source: 'a', target: 'fixed' }]);
  assert.deepEqual(result.slice(0, 2).map(item => item.position), [{ x: 10, y: 20 }, { x: 254, y: 20 }]);
  assert.equal(result[2], fixed);
});

test('an isolated grid uses the linked workflow’s final bounds after obstacle avoidance', () => {
  const wall = node('wall', 0, -1000, { selected: false, measured: { width: 2000, height: 3000 } });
  const nodes = [node('a', 0, 0), node('b', 12, 12), node('loose', 700, 200), wall];
  const links = [{ source: 'a', target: 'b' }];
  const result = arrangeSelectedNodes(nodes, links);
  assert.equal(result[0].position.x, -488);
  assert.deepEqual(result[2].position, { x: -488, y: 184 });
  assert.equal(result[3], wall);
  assert.equal(arrangeSelectedNodes(result, links), result);
});
