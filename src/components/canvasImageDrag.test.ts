import assert from 'node:assert/strict';
import test from 'node:test';
import { withCanvasImageDrag } from './canvasImageDrag.ts';

test('composer image dragging preserves node content and lock/tool restrictions', () => {
  for (const draggable of [true, false]) {
    const node = { id: 'image', position: { x: 12, y: 34 }, draggable,
      data: { composer: { prompt: 'keep me' }, results: [{ id: 'result' }] } };
    const result = withCanvasImageDrag(node);
    assert.equal(result.draggable, draggable);
    assert.equal(result.data, node.data);
    assert.equal(result.position, node.position);
    assert.ok(result.dragHandle?.split(', ').includes('.image-node-result'));
    assert.equal('dragHandle' in node, false);
  }
});

test('legacy nodes keep their original drag rules', () => {
  const node = { id: 'legacy', position: { x: 0, y: 0 }, dragHandle: '.custom-heading', data: {} };
  assert.equal(withCanvasImageDrag(node), node);
});
