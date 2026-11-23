import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainCrop, dragCrop } from './imageCrop.ts';
import { isFileAsset } from './fileCollection.ts';

test('crop handles keep the opposite edges fixed, within original pixels at any pointer scale', () => {
  const rect = { x: 200, y: 100, width: 600, height: 400 };
  assert.deepEqual(dragCrop(rect, 'nw', 100, 50, 1200, 800), { x: 300, y: 150, width: 500, height: 350 });
  assert.deepEqual(dragCrop(rect, 'se', 800, 900, 1200, 800), { x: 200, y: 100, width: 1000, height: 700 });
  assert.deepEqual(dragCrop(rect, 'n', 500, 50, 1200, 800), { x: 200, y: 150, width: 600, height: 350 });
  assert.deepEqual(dragCrop(rect, 'w', -500, 200, 1200, 800), { x: 0, y: 100, width: 800, height: 400 });
  assert.deepEqual(dragCrop(rect, 'e', -900, 0, 1200, 800, 10), { x: 200, y: 100, width: 10, height: 400 });
  // A 100px pointer displacement at 50% zoom moves 200 canvas units.
  assert.deepEqual(dragCrop(rect, 'sw', 100 / .5, -20 / .5, 1200, 800), { x: 400, y: 100, width: 400, height: 360 });
});

test('moving a crop preserves its dimensions and clamps all four image boundaries', () => {
  const rect = { x: 200, y: 100, width: 600, height: 400 };
  assert.deepEqual(dragCrop(rect, 'move', -900, 900, 1200, 800), { ...rect, x: 0, y: 400 });
  assert.deepEqual(dragCrop(rect, 'move', 900, -900, 1200, 800), { ...rect, x: 600, y: 0 });
  assert.deepEqual(rect, { x: 200, y: 100, width: 600, height: 400 });
});

test('committed crop bounds round once to valid nonempty original pixel rectangles', () => {
  assert.deepEqual(constrainCrop({ x: -5.2, y: 399.9, width: 900.4, height: .1 }, 600, 400), { x: 0, y: 399, width: 600, height: 1 });
  assert.deepEqual(constrainCrop({ x: 20.4, y: 10.7, width: 99.6, height: 80.3 }, 600, 400), { x: 20, y: 11, width: 100, height: 80 });
});

test('clipboard crop restoration accepts an original asset and rejects broken or recursive sources', () => {
  const source = { id: 'original', name: 'image.png', kind: 'image', url: 'blob:original', width: 1200, height: 800 };
  const asset = { ...source, url: 'blob:cropped', width: 600, height: 400, crop: { source, rect: { x: 100, y: 50, width: 600, height: 400 } } };
  assert.equal(isFileAsset(asset), true);
  assert.equal(isFileAsset({ ...asset, crop: { ...asset.crop, source: 'broken' } }), false);
  assert.equal(isFileAsset({ ...asset, crop: { ...asset.crop, source: asset } }), false);
  assert.equal(isFileAsset({ ...asset, crop: { ...asset.crop, rect: { x: 900, y: 0, width: 600, height: 400 } } }), false);
});
