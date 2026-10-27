import test from 'node:test';
import assert from 'node:assert/strict';
import { cropPixels, cropRevision, defaultCropData, dragCrop, fitCropRatio, resizeCropDimension, restoreCropData, type CropHandle } from './crop.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { previewImages } from './preview.ts';
import { canConnect } from './connectionRules.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { AppNode, CropNode, FileAsset } from './types';

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 1200, height: 800 });
const file: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const crop: CropNode = { id: 'crop', type: 'crop', position: { x: 0, y: 0 }, data: { ...defaultCropData, result: asset('result'), outputRevision: cropRevision(defaultCropData, 'input') } };
const input = { id: 'in', source: 'image', sourceHandle: 'file', target: 'crop', targetHandle: 'image' };

test('pixel crop stays inside the source and preserves native resolution', () => {
  assert.deepEqual(cropPixels({ x: .25, y: .25, width: .5, height: .5 }, 1200, 800), { x: 300, y: 200, width: 600, height: 400 });
  assert.deepEqual(cropPixels({ x: .9999, y: .9999, width: .0001, height: .0001 }, 1200, 800), { x: 1199, y: 799, width: 1, height: 1 });
  const square = fitCropRatio(defaultCropData.rect, 1, 1200, 800);
  assert.deepEqual(cropPixels(square, 1200, 800), { x: 200, y: 0, width: 800, height: 800 });
});
test('W/H uses pixels, lock preserves ratio and extreme values remain bounded', () => {
  const rect = { x: .1, y: .1, width: .5, height: .5 };
  const free = resizeCropDimension(rect, 'width', 300, 1200, 800, false);
  assert.equal(cropPixels(free, 1200, 800).width, 300);
  assert.equal(cropPixels(free, 1200, 800).height, 400);
  const locked = resizeCropDimension(rect, 'width', 300, 1200, 800, true);
  assert.equal(cropPixels(locked, 1200, 800).height, 200);
  const large = resizeCropDimension(rect, 'height', 100000, 1200, 800, true);
  assert.ok(large.x + large.width <= 1 && large.y + large.height <= 1);
  assert.equal(large.width / large.height, rect.width / rect.height);
  for (const n of [0, -10, NaN, Infinity]) assert.deepEqual(resizeCropDimension(rect, 'height', n, 1200, 800, true), rect);
});
test('all eight resize handles and moving stay bounded, locked corners keep their opposite anchor', () => {
  const rect = { x: .2, y: .25, width: .4, height: .3 };
  for (const handle of ['move', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as CropHandle[]) {
    for (const locked of [false, true]) for (const [dx, dy] of [[-2, -2], [2, 2], [-.1, .15]]) {
      const next = dragCrop(rect, handle, dx, dy, locked, 1200, 800);
      assert.ok(next.x >= -1e-10 && next.y >= -1e-10 && next.x + next.width <= 1.000001 && next.y + next.height <= 1.000001, JSON.stringify({ handle, next }));
      assert.ok(next.width > 0 && next.height > 0);
      if (locked) assert.ok(Math.abs(next.width / next.height - rect.width / rect.height) < 1e-9);
    }
  }
  const next = dragCrop(rect, 'nw', -.1, -.1, true, 1200, 800);
  assert.ok(Math.abs(next.x + next.width - (rect.x + rect.width)) < 1e-9);
  assert.ok(Math.abs(next.y + next.height - (rect.y + rect.height)) < 1e-9);
});
test('Crop output reaches Preview and Sunburst and invalidates recursively on upstream change or disconnect', () => {
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  const previewEdge = { id: 'preview', source: crop.id, sourceHandle: 'result', target: preview.id, targetHandle: 'file' };
  assert.deepEqual(previewImages(preview.id, [crop, file, preview], [input, previewEdge]), [crop.data.result]);
  const second: CropNode = { ...crop, id: 'second', data: { ...crop.data, result: asset('second'), outputRevision: cropRevision(crop.data, 'result') } };
  const edges = [input, { id: 'chain', source: crop.id, sourceHandle: 'result', target: second.id, targetHandle: 'image' }];
  assert.equal(imageOutput(second, 'result', [file, crop, second], edges)[0].id, 'second');
  assert.deepEqual(imageOutput(second, 'result', [file, crop, second], edges.slice(1)), []);
  const changed: CropNode = { ...crop, data: { ...crop.data, rect: { ...crop.data.rect, width: .5 } } };
  assert.deepEqual(imageOutput(changed, 'result', [file, changed], [input]), []);
  assert.deepEqual(imageOutput(second, 'result', [file, changed, second], edges), []);
  const replaced: AppNode = { ...file, data: { assets: [asset('replacement')] } };
  assert.deepEqual(imageOutput(crop, 'result', [replaced, crop], [input]), []);
  assert.deepEqual(previewImages(preview.id, [file, crop, preview], [previewEdge]), []);
  const generator: AppNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Edit the crop' } };
  const run = prepareSunburstRun([file, crop, generator, prompt], [input, { id: 'p', source: 'prompt', target: 'g', targetHandle: 'prompt' }, { id: 'out', source: 'crop', sourceHandle: 'result', target: 'g', targetHandle: 'image-0' }], ['g'], 1);
  assert.equal(run.error, undefined);
  assert.deepEqual(run.tasks[0].imageRequest?.images, ['blob:result']);
});
test('Crop connections reject invalid types, duplicate connections, cycles, invalid handles and locked nodes', () => {
  const second: CropNode = { ...crop, id: 'second' };
  const connection = { ...input, source: 'second', sourceHandle: 'result' };
  assert.equal(canConnect(input, [file, crop], []), true);
  assert.equal(canConnect(input, [file, crop], [input]), false);
  assert.equal(canConnect(connection, [crop, second], []), true);
  assert.equal(canConnect({ ...connection, sourceHandle: 'wrong' }, [crop, second], []), false);
  assert.equal(canConnect(connection, [crop, second], [{ id: 'cycle', source: 'crop', target: 'second' }]), false);
  assert.equal(canConnect(input, [file, { ...crop, data: { ...crop.data, locked: true } }], []), false);
  assert.equal(canConnect(input, [{ ...file, type: 'text', data: { text: 'bad' } }, crop], []), false);
});
test('copy and persistence retain the base image, discard stale clipboard outputs and collect both assets', () => {
  const detached: CropNode = { ...crop, data: { ...crop.data, baseImage: asset('input') } };
  assert.equal(imageOutput(detached, 'result', [detached], [])[0].id, 'result');
  const restored = restoreCropData(detached.data)!;
  assert.equal(restored.baseImage?.id, 'input'); assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined); assert.equal(restored.locked, false);
  assert.equal(restoreCropData({ ...detached.data, rect: { x: .9, y: 0, width: 1, height: 1 } }), undefined);
  assert.equal(restoreCropData({ ...detached.data, rect: { x: NaN, y: 0, width: 1, height: 1 } }), undefined);
  const [mapped] = mapAssets([detached], item => ({ ...item, url: item.url + '-restored' }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});
