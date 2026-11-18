import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodePositionChange } from '@xyflow/react';
import { canvasGridOrigin, canvasSvgGridOrigin, readGridSnap, saveGridSnap, snapDragChanges } from './canvasGrid.ts';

const position = (id: string, x: number, y: number, dragging = true): NodePositionChange => ({
  id, position: { x, y }, type: 'position', dragging,
});
const anchor = { id: 'a', offset: { x: 0, y: 0 } };

test('grid alignment defaults off and remembers the browser preference', () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
  assert.equal(readGridSnap(storage), false);
  saveGridSnap(true, storage);
  assert.equal(readGridSnap(storage), true);
  saveGridSnap(false, storage);
  assert.equal(readGridSnap(storage), false);
  assert.equal(readGridSnap({ getItem: () => { throw new Error('Storage unavailable'); } }), false);
  assert.doesNotThrow(() => saveGridSnap(true, { setItem: () => { throw new Error('Storage unavailable'); } }));
});

test('snap to the rendered WebGL and SVG grids in canvas coordinates', () => {
  const changes = [position('a', -31.2, 48.75)];
  assert.deepEqual(snapDragChanges(changes, anchor, canvasGridOrigin), [position('a', -31.5, 64.5)]);
  assert.deepEqual(snapDragChanges(changes, anchor, canvasSvgGridOrigin), [position('a', -15.5, 48.5)]);
});

test('translate the full selection by one offset through the final drag batch', () => {
  const selected = { id: 'c', type: 'select', selected: true } as const;
  for (const dragging of [true, false]) {
    const changes = [position('b', 100.25, -4.5, dragging), position('a', 26.75, 35.25, dragging), selected];
    assert.deepEqual(snapDragChanges(changes, anchor, canvasGridOrigin), [
      position('b', 106, -7.25, dragging), position('a', 32.5, 32.5, dragging), selected,
    ]);
  }
});

test('snap a node with an existing custom origin by its rendered top-left', () => {
  const offCenterAnchor = { id: 'a', offset: { x: -100, y: -50 } };
  assert.deepEqual(snapDragChanges([position('a', 130, 83)], offCenterAnchor, canvasGridOrigin), [
    position('a', 132.5, 82.5),
  ]);
});

test('pass unrelated position changes through without snapping', () => {
  const changes = [position('b', 3, 5), { id: 'a', type: 'position', position: { x: 10, y: 12 } } as const];
  assert.equal(snapDragChanges(changes, anchor, canvasGridOrigin), changes);
});
