import test from 'node:test';
import assert from 'node:assert/strict';
import { CompositorPreviewSession, reorderAtDrop } from './compositor/interaction.ts';
import { CompositorEffectCache, compositorPixels } from './compositor/effects.ts';
import { compositorLayout, defaultCompositorDocument, newEffect, resizeLayer, type LayerTransform } from './compositor.ts';
import { angleDelta, layerBounds, resizeCursor, resizeHandles, sameTransform, snapMove, snapRotation, snapTargets } from './compositor/canvasGeometry.ts';
import { CompositorRasterCache, effectRasterKey } from './compositor/renderCache.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);
const anchor = (t: LayerTransform, sx: number, sy: number) => {
  const a = t.rotation * Math.PI / 180, x = sx * t.width / 2, y = sy * t.height / 2;
  return { x: t.x + t.width / 2 + x * Math.cos(a) - y * Math.sin(a), y: t.y + t.height / 2 + x * Math.sin(a) + y * Math.cos(a) };
};
test('all eight resize handles keep the opposite anchor at every rotation, with free and locked aspect', () => {
  for (const rotation of [0, 35, 90, 180, -73, 360]) for (const handle of resizeHandles) for (const locked of [false, true]) {
    const t = { x: 17, y: -29, width: 300, height: 200, rotation };
    const resized = resizeLayer(t, 39, -23, handle, locked);
    const sx = handle.includes('w') ? 1 : handle.includes('e') ? -1 : 0, sy = handle.includes('n') ? 1 : handle.includes('s') ? -1 : 0;
    const before = anchor(t, sx, sy), after = anchor(resized, sx, sy);
    near(before.x, after.x); near(before.y, after.y);
    if (locked) near(resized.width / resized.height, 1.5);
    else { if (!sx) near(resized.width, t.width); if (!sy) near(resized.height, t.height); }
    const centered = resizeLayer(t, 39, -23, handle, locked, true);
    near(t.x + t.width / 2, centered.x + centered.width / 2); near(t.y + t.height / 2, centered.y + centered.height / 2);
  }
});
test('resizing clamps at valid dimensions, stays reversible and rotates the pointer cursor with the layer', () => {
  const t = { x: 0, y: 0, width: 300, height: 200, rotation: 45 };
  for (const handle of resizeHandles) for (const delta of [-1e6, 1e6]) for (const locked of [false, true]) {
    const resized = resizeLayer(t, delta, delta, handle, locked);
    assert.ok(resized.width >= 1 && resized.height >= 1 && resized.width <= 16384 && resized.height <= 16384);
    if (locked) near(resized.width / resized.height, 1.5);
  }
  assert.ok(sameTransform(resizeLayer(t, 0, 0, 'e', true), t));
  assert.equal(resizeCursor('e', 90), 'ns-resize');
  assert.equal(resizeCursor('nw', 45), 'ns-resize');
  assert.equal(resizeCursor('ne', -45), 'ns-resize');
});
test('move snaps use a screen-space threshold and align rotated bounds without moving a constrained axis', () => {
  const t = { x: 302, y: 201, width: 200, height: 100, rotation: 0 };
  const targets = { x: [0, 400, 800], y: [0, 250, 500] };
  for (const zoom of [.1, .5, 1, 2]) {
    const result = snapMove(t, targets, zoom);
    near(result.transform.x, 300); near(result.transform.y, 200); assert.equal(result.guides.length, 2);
  }
  const far = { ...t, x: 310, y: 210 };
  assert.ok(sameTransform(snapMove(far, targets, 1).transform, far));
  const constrained = snapMove(t, targets, .5, 'x'); near(constrained.transform.y, t.y); assert.deepEqual(constrained.guides, [{ axis: 'x', value: 400 }]);
  const rotated = { ...t, rotation: 45 }, bounds = layerBounds(rotated);
  const result = snapMove(rotated, { x: [bounds.right + 2], y: [bounds.top - 3] }, 1);
  near(layerBounds(result.transform).right, bounds.right + 2); near(layerBounds(result.transform).top, bounds.top - 3);
});
test('snap targets exclude selected, hidden and disconnected layers, retain locked targets and canvas edges', () => {
  const doc = defaultCompositorDocument();
  doc.layers[1].transform = { x: 42, y: 37, width: 100, height: 80, rotation: 0 }; doc.layers[1].locked = true;
  const inputs = { 'layer-1': { connected: true, asset: { id: 'a', url: 'blob:a', name: 'a', kind: 'image' as const, width: 100, height: 80 } } };
  const targets = snapTargets(compositorLayout(doc, inputs), 'background');
  assert.ok(targets.x.includes(42) && targets.y.includes(37));
  assert.equal(snapTargets(compositorLayout(doc, inputs), 'layer-1').x.length, 3);
  doc.layers[1].visible = false;
  assert.equal(snapTargets(compositorLayout(doc, inputs), 'background').x.length, 3);
  doc.layers[1].visible = true;
  assert.equal(snapTargets(compositorLayout(doc, {}), 'background').x.length, 3);
});
test('rotation crosses the atan2 seam smoothly and applies cardinal, stepped and bypass modes', () => {
  near(angleDelta(179, -179), 2); near(angleDelta(-179, 179), -2);
  near(snapRotation(88.5, false, false), 90);
  near(snapRotation(88.5, false, true), 88.5);
  near(snapRotation(44.4, true, false), 45);
  near(snapRotation(-46, true, true), -45);
  near(snapRotation(359, false, false), 360);
});

test('continuous drafts publish completed frames without starving; commit, cancel and changed inputs reject old frames', () => {
  const session = new CompositorPreviewSession();
  const native = session.update(false, 'saved-document:input-A');
  const first = session.update(true, 'saved-document:input-A');
  for (let i = 0; i < 100; i++) session.update(true, 'saved-document:input-A');
  assert.equal(session.accepts(native), false);
  assert.equal(session.accepts(first), true, 'a slower draft is still useful during the same gesture');
  session.update(false, 'edited-document:input-A');
  assert.equal(session.accepts(first), false, 'draft cannot overwrite a committed result');
  const next = session.update(true, 'edited-document:input-A');
  session.update(false, 'edited-document:input-A');
  assert.equal(session.accepts(next), false, 'Escape invalidates all outstanding drafts');
  const restarted = session.update(true, 'edited-document:input-A');
  assert.equal(session.accepts(next), false, 'starting another gesture does not revive cancelled work');
  session.update(true, 'edited-document:input-B');
  assert.equal(session.accepts(restarted), false, 'new upstream images invalidate previous drafts');
});

test('drop insertion works above and below in both directions without changing identities or no-op history', () => {
  const items = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  const ids = (value: typeof items) => value.map(item => item.id).join('');
  assert.equal(ids(reorderAtDrop(items, 'a', 'c', 'before')), 'bacd');
  assert.equal(ids(reorderAtDrop(items, 'a', 'c', 'after')), 'bcad');
  assert.equal(ids(reorderAtDrop(items, 'd', 'b', 'before')), 'adbc');
  assert.equal(ids(reorderAtDrop(items, 'd', 'b', 'after')), 'abdc');
  assert.equal(reorderAtDrop(items, 'b', 'c', 'before'), items);
  assert.equal(reorderAtDrop(items, 'b', 'a', 'after'), items);
  assert.equal(reorderAtDrop(items, 'missing', 'a', 'before'), items);
  assert.equal(reorderAtDrop(items, 'b', 'b', 'after'), items);
  assert.equal(ids(items), 'abcd');
  assert.equal(reorderAtDrop(items, 'd', 'a', 'before')[0], items[3]);
});

test('cached effect prefixes match uncached pixels after edits, order changes, toggles and source replacement', () => {
  const cache = new CompositorEffectCache(64), source = Uint8ClampedArray.from({ length: 64 }, (_, i) => i % 4 === 3 ? 255 : (i * 13) % 256);
  const blur = newEffect('blur'), color = newEffect('color'), invert = newEffect('invert');
  assert.equal(color.type, 'color');
  if (color.type !== 'color') return;
  const changed = { ...color, settings: { ...color.settings, exposure: 1.74, saturation: 85 } };
  for (const effects of [[blur, color], [blur, changed], [changed, blur], [blur, changed, invert], [blur, { ...changed, enabled: false }]]) {
    assert.deepEqual(cache.render('source-A', source, 4, 4, effects, .5), compositorPixels(source, 4, 4, effects, .5));
    assert.ok(cache.retainedPixels <= 64);
  }
  const replacement = source.map((value, i) => i % 4 === 3 ? value : 255 - value);
  assert.deepEqual(cache.render('source-B', replacement, 4, 4, [blur, changed], .5), compositorPixels(replacement, 4, 4, [blur, changed], .5));
  for (let i = 0; i < 30; i++) cache.render('source-A', source, 4, 4, [{ ...color, settings: { ...color.settings, exposure: i / 10 } }], .5);
  assert.ok(cache.retainedPixels <= 64, 'repeated slider edits cannot grow retained memory without bounds');
  assert.deepEqual(source, Uint8ClampedArray.from({ length: 64 }, (_, i) => i % 4 === 3 ? 255 : (i * 13) % 256));
});

test('effect raster variants reuse enabled pixels across layer identities and disabled edits, but invalidate sources, order and scale', () => {
  const blur = newEffect('blur'), invert = newEffect('invert');
  const original = effectRasterKey('image-A', [blur, invert], 1);
  assert.equal(effectRasterKey('image-A', [{ ...blur, id: 'copy' }, { ...invert, id: 'copy-2' }], 1), original);
  assert.equal(effectRasterKey('image-A', [blur, { ...newEffect('color'), enabled: false }, invert], 1), original);
  assert.notEqual(effectRasterKey('image-B', [blur, invert], 1), original);
  assert.notEqual(effectRasterKey('image-A', [blur, invert], .5), original);
  assert.notEqual(effectRasterKey('image-A', [invert, blur], 1), original);
  assert.notEqual(effectRasterKey('image-A', [{ ...blur, enabled: false }, invert], 1), original);
});

test('bounded raster cache retains on/off variants, evicts least recently used pixels, and releases replaced sources', () => {
  const cache = new CompositorRasterCache<{ width: number; height: number; name: string }>(48);
  const on = { width: 4, height: 4, name: 'blur-on' }, off = { ...on, name: 'blur-off' };
  cache.set('on', 'source-A', on); cache.set('off', 'source-A', off);
  assert.equal(cache.get('on'), on); assert.equal(cache.get('off'), off);
  cache.set('other', 'source-B', { ...on, name: 'other' }); cache.get('on');
  cache.set('new', 'source-A', { ...on, name: 'new' });
  assert.equal(cache.get('off'), undefined); assert.equal(cache.get('on'), on); assert.equal(cache.retainedPixels, 48);
  cache.set('on', 'source-A', { width: 2, height: 2, name: 'replacement' }); assert.equal(cache.retainedPixels, 36);
  cache.set('oversized', 'source-A', { width: 8, height: 8, name: 'too large' }); assert.equal(cache.get('oversized'), undefined);
  cache.prune(new Set(['source-A'])); assert.equal(cache.get('other'), undefined); assert.equal(cache.retainedPixels, 20);
  cache.prune(new Set()); assert.equal(cache.retainedPixels, 0);
});
