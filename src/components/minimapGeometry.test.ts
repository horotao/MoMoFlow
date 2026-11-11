import assert from 'node:assert/strict';
import test from 'node:test';
import { findMapFocus, fitMapCamera, mapPointToCanvas, minimapSize, projectMapRect } from './minimapGeometry.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('map focus follows the viewport center with a stable handoff between neighboring nodes', () => {
  const viewport = { x: 0, y: 0, width: 1000, height: 800 };
  const nodes = [
    { id: 'left', x: 350, y: 350, width: 100, height: 100 },
    { id: 'right', x: 550, y: 350, width: 100, height: 100 },
  ];
  assert.equal(findMapFocus(viewport, nodes, null), 'left');
  assert.equal(findMapFocus({ ...viewport, x: 10 }, nodes, 'left'), 'left');
  assert.equal(findMapFocus({ ...viewport, x: 100 }, nodes, 'left'), 'right');
  assert.equal(findMapFocus({ ...viewport, x: 3000 }, nodes, 'right'), null);
  assert.equal(findMapFocus(viewport, [nodes[1]], 'left'), 'right');
  assert.equal(findMapFocus(viewport, [], 'left'), null);
});

test('focus remains on a node when zooming inside it and ignores unmeasured nodes', () => {
  const node = { id: 'large', x: -500, y: -500, width: 1000, height: 1000 };
  assert.equal(findMapFocus({ x: 0, y: 0, width: 100, height: 100 }, [node], null), 'large');
  assert.equal(findMapFocus({ x: 0, y: 0, width: 100, height: 100 },
    [{ id: 'pending', x: 50, y: 50, width: 0, height: 0 }], null), null);
});

test('map includes both distant content and the viewport with a stable screen margin', () => {
  const viewport = { x: 2000, y: -500, width: 1440, height: 900 };
  const nodes = [{ x: -5000, y: -3000, width: 300, height: 200 }, { x: 400, y: 2000, width: 800, height: 500 }];
  const camera = fitMapCamera(viewport, nodes);
  for (const rect of [viewport, ...nodes]) {
    const projected = projectMapRect(rect, camera);
    assert.ok(projected.x >= 8 - 1e-7 && projected.y >= 8 - 1e-7);
    assert.ok(projected.x + projected.width <= minimapSize.width - 8 + 1e-7);
    assert.ok(projected.y + projected.height <= minimapSize.height - 8 + 1e-7);
  }
});

test('click mapping stays aligned with displayed nodes at intermediate animation cameras', () => {
  const node = { x: -2500, y: 1600, width: 300, height: 220 };
  // An in-flight camera need not equal either the previous or next fitted bounds.
  for (const camera of [{ x: -400, y: 200, scale: 0.001 }, { x: 1500, y: -1200, scale: 0.21 }]) {
    const rect = projectMapRect(node, camera);
    const center = mapPointToCanvas({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, camera);
    close(center.x, node.x + node.width / 2);
    close(center.y, node.y + node.height / 2);
  }
});

test('empty maps and zoom limits produce finite centered viewport frames', () => {
  for (const zoom of [0.01, 0.5, 1, 2]) {
    const viewport = { x: -3000 / zoom, y: 1000 / zoom, width: 1440 / zoom, height: 900 / zoom };
    const camera = fitMapCamera(viewport, []);
    const frame = projectMapRect(viewport, camera);
    assert.ok(camera.scale > 0 && Number.isFinite(camera.scale));
    close(frame.x + frame.width / 2, minimapSize.width / 2);
    close(frame.y + frame.height / 2, minimapSize.height / 2);
  }
  assert.ok(Number.isFinite(fitMapCamera({ x: 0, y: 0, width: 0, height: 0 }, []).scale));
});
