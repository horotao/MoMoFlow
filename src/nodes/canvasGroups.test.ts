import assert from 'node:assert/strict';
import test from 'node:test';
import { arrangeGroup, groupSelectedNodes, settleGroupDrop, ungroupNodes } from './canvasGroups.ts';
import type { CanvasGroup, CanvasText } from './types.ts';

const node = (id: string, x: number, y: number, locked = false): CanvasText => ({
  id, type: 'text', position: { x, y }, selected: true, origin: [.5, 0], measured: { width: 384, height: 384 },
  data: { locked, text: '', textComposer: { prompt: '', format: 'txt', quantity: 1,
    selection: { modelIds: [], autoSelect: false, multiple: false } } },
});

test('grouping uses member bounds and ungrouping keeps the moved world coordinates', () => {
  const a = node('a', 120, 60), b = node('b', 670, 190);
  const outside = { ...node('outside', 900, 500), selected: false };
  const grouped = groupSelectedNodes([a, b, outside], 'group');
  const [group, ...members] = grouped;
  assert.deepEqual(group.position, { x: -136, y: -4 });
  assert.deepEqual([group.width, group.height], [1062, 642]);
  assert.deepEqual(members.map(item => item.parentId), ['group', 'group', undefined]);
  assert.strictEqual(groupSelectedNodes(grouped, 'another'), grouped);
  const moved = { ...group, position: { x: group.position.x + 30, y: group.position.y - 18 } };
  const flattened = ungroupNodes([moved, ...members], group.id);
  assert.deepEqual(flattened.map(item => item.position), [{ x: 150, y: 42 }, { x: 700, y: 172 }, outside.position]);
  assert.deepEqual(flattened.map(item => item.parentId), [undefined, undefined, undefined]);
  assert.strictEqual(flattened[2], outside);
});

test('group alignment keeps locked members and outside nodes in place', () => {
  const locked = node('locked', 876, 400, true);
  const outside = { ...node('outside', 1100, 200), selected: false };
  const grouped = groupSelectedNodes([node('a', 270, 60), node('b', 780, 120), locked, outside], 'group');
  const aligned = arrangeGroup(grouped, [], 'group', 'top');
  const [a, b, stillLocked, stillOutside] = ungroupNodes(aligned, 'group');
  assert.equal(a.position.y, b.position.y);
  assert.deepEqual(stillLocked.position, locked.position);
  assert.strictEqual(stillOutside, outside);
});

const group = (id: string, x: number, y: number, width = 800, height = 800): CanvasGroup => ({
  id, type: 'canvas-group', position: { x, y }, width, height, data: { label: id },
});

test('new fields use the first available default name and retain existing labels', () => {
  const members = [node('a', 150, 60), node('b', 670, 60)];
  const renamed = group('手动命名', 0, 0);
  const first = groupSelectedNodes([renamed, ...members], 'first')[0];
  const second = groupSelectedNodes([first, renamed, ...members], 'second')[0];
  const [third, ...remaining] = groupSelectedNodes([first, second, renamed, ...members], 'third');
  assert.deepEqual([first.data.label, second.data.label, third.data.label], ['Field', 'Field 1', 'Field 2']);
  assert.strictEqual(remaining[2], renamed);
});

test('drop uses the card center, and grows both crossed sides without moving members', () => {
  const frame = group('group', 0, 0);
  const existing = { ...node('existing', 280, 112, true), parentId: frame.id };
  const misses = [frame, existing, node('incoming', 820, 570)];
  assert.strictEqual(settleGroupDrop(misses, ['incoming']), misses);
  const incoming = node('incoming', 760, 570);
  const [grown, member, joined] = settleGroupDrop([frame, existing, incoming], [incoming.id]);
  assert.deepEqual([grown.position, grown.width, grown.height], [{ x: 0, y: 0 }, 1016, 1018]);
  assert.strictEqual(member, existing);
  assert.equal(joined.parentId, frame.id);
  assert.deepEqual(joined.position, incoming.position);
});

test('member overhang grows the old frame, but touching its edge detaches without shrinking', () => {
  const frame = group('group', 100, 100);
  const member = { ...node('member', -160, 100), parentId: frame.id };
  const sibling = { ...node('sibling', 480, 120, true), parentId: frame.id };
  const [grown, kept, rebased] = settleGroupDrop([frame, member, sibling], [member.id]);
  assert.deepEqual([grown.position, grown.width, grown.height], [{ x: -316, y: 100 }, 1216, 800]);
  assert.deepEqual(kept.position, { x: 256, y: 100 });
  assert.deepEqual(rebased.position, { x: 896, y: 120 });
  const touching = { ...member, position: { x: 320, y: 800 } };
  const [unchanged, detached] = settleGroupDrop([frame, touching], [member.id]);
  assert.strictEqual(unchanged, frame);
  assert.equal(detached.parentId, undefined);
  assert.deepEqual(detached.position, { x: 420, y: 900 });
});

test('transfer grows the two crossed edges and keeps both group frames', () => {
  const from = group('from', 0, 0);
  const to = group('to', 840, 0);
  const member = { ...node('member', 880, 100), parentId: from.id };
  const [old, next, transferred] = settleGroupDrop([from, to, member], [member.id]);
  assert.equal(old.width, 1136);
  assert.deepEqual(next.position, { x: 624, y: 0 });
  assert.equal(transferred.parentId, to.id);
  assert.deepEqual(transferred.position, { x: 256, y: 100 });
  const overlap = { ...member, position: { x: 400, y: 100 }, parentId: to.id };
  const inBoth = [old, next, overlap];
  assert.strictEqual(settleGroupDrop(inBoth, [overlap.id]), inBoth);
});

test('multiple drops use the same frame and whole-frame moves do not reparent', () => {
  const frame = group('group', 30, 20);
  const overhang = node('overhang', 790, 150);
  const outside = node('outside', 890, 550);
  const inside = node('inside', 222, 436);
  const initial = [frame, overhang, outside, inside];
  const [, joined, stillOutside, untouched] = settleGroupDrop(initial, [overhang.id, outside.id, inside.id]);
  assert.equal(joined.parentId, frame.id);
  assert.strictEqual(stillOutside, outside);
  assert.equal(untouched.parentId, frame.id);
  const onlyInside = settleGroupDrop([frame, inside], [inside.id]);
  assert.strictEqual(onlyInside[0], frame);
  assert.strictEqual(settleGroupDrop(initial, [frame.id, overhang.id]), initial);
});
