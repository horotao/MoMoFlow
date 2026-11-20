import assert from 'node:assert/strict';
import test from 'node:test';
import type { Node } from '@xyflow/react';
import { makeRoomForNodes } from './canvasInsertion.ts';

const node = (id: string, x: number, y: number, width: number, height: number, locked = false): Node => ({
  id, position: { x, y }, measured: { width, height }, data: { locked },
});

test('reserves both slots and pushes along each lane only as far as its neighbors require', () => {
  const nodes = [
    node('source', 0, 500, 100, 100),
    node('above', 0, 352, 100, 100),
    node('further-up', 0, 204, 100, 100),
    node('beside', 160, 500, 100, 100),
    node('further-right', 308, 500, 100, 100),
    node('separate', 525, 940, 100, 100),
  ];
  const { positions, pushes } = makeRoomForNodes(nodes, [
    { id: 'prompt', rect: { x: 0, y: 352, width: 100, height: 100 }, direction: 'up' },
    { id: 'model', rect: { x: 160, y: 500, width: 100, height: 100 }, direction: 'right' },
  ], new Set(['source']));
  assert.deepEqual(Object.fromEntries(positions), {
    prompt: { x: 0, y: 352 }, model: { x: 160, y: 500 },
    above: { x: 0, y: 204 }, 'further-up': { x: 0, y: 56 },
    beside: { x: 308, y: 500 }, 'further-right': { x: 456, y: 500 },
  });
  assert.deepEqual(pushes, [
    { id: 'above', depth: 0, axis: 'y', sign: -1, behind: [] },
    { id: 'further-up', depth: 1, axis: 'y', sign: -1, behind: [{ id: 'above', separation: 100 }] },
    { id: 'beside', depth: 0, axis: 'x', sign: 1, behind: [] },
    { id: 'further-right', depth: 1, axis: 'x', sign: 1, behind: [{ id: 'beside', separation: 100 }] },
  ]);
});

test('gives a neighbor a clear path when a locked node blocks the preferred push', () => {
  const { positions } = makeRoomForNodes([
    node('neighbor', 230, 10, 50, 50),
    node('locked', 370, 0, 80, 50, true),
  ], [
    { id: 'model', rect: { x: 200, y: 0, width: 100, height: 100 }, direction: 'right' },
  ], new Set());
  assert.deepEqual(Object.fromEntries(positions), {
    neighbor: { x: 230, y: 148 }, model: { x: 200, y: 0 },
  });
});

test('places the new node past a locked obstacle covering its reserved space', () => {
  const { positions, pushes } = makeRoomForNodes([node('locked', 200, 0, 100, 100, true)], [
    { id: 'model', rect: { x: 200, y: 0, width: 100, height: 100 }, direction: 'right' },
  ], new Set());
  assert.deepEqual(Object.fromEntries(positions), { model: { x: 348, y: 0 } });
  assert.deepEqual(pushes, []);
});
