import test from 'node:test';
import assert from 'node:assert/strict';
import { changeResizeDimension, defaultResizeSettings, resizeDocument, resizeRevision, resizeSize, restoreResizeData, toggleResizeAspectRatio, validResizeSize, type ResizeSettings } from './resize.ts';
import { imageOutput } from './sunburstRun.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import type { AppNode, ResizeNode, FileAsset } from './types';

const settings = defaultResizeSettings;
test('a locked ratio survives rounding, alternating axes and clipboard restoration', () => {
  for (const source of [{ width: 3840, height: 2160 }, { width: 768, height: 1376 }]) {
    let current: ResizeSettings = { ...settings };
    for (const axis of ['width', 'height', 'width', 'height'] as const) {
      current = changeResizeDimension(current, resizeSize(current, source), axis, 10)!;
      current = restoreResizeData({ settings: current })!.settings;
      current = changeResizeDimension(current, resizeSize(current, source), axis, source[axis])!;
      assert.deepEqual(resizeSize(current, source), source, `${axis} must recover the original ratio after a small resize`);
    }
  }
});

test('locked dimensions scale together and relocking preserves the current custom ratio', () => {
  const source = { width: 768, height: 1376 };
  assert.deepEqual(resizeSize(settings, source), source);
  const half = changeResizeDimension(settings, source, 'width', 384)!;
  assert.deepEqual(resizeSize(half, source), { width: 384, height: 688 });
  const custom = changeResizeDimension(toggleResizeAspectRatio(half), resizeSize(half, source), 'width', 500)!;
  assert.deepEqual(resizeSize(custom, source), { width: 500, height: 688 });
  const relocked = changeResizeDimension(toggleResizeAspectRatio(custom), resizeSize(custom, source), 'width', 250)!;
  assert.deepEqual(resizeSize(relocked, source), { width: 250, height: 344 });
  assert.deepEqual(resizeSize(changeResizeDimension(settings, source, 'height', 688)!, source), { width: 384, height: 688 });
  assert.deepEqual(resizeSize({ lockAspectRatio: false }, source), source, 'Reset restores original size without changing the lock');
  assert.equal(resizeRevision({ settings: half }, 'source'), resizeRevision({ settings: { ...half, lockAspectRatio: false } }, 'source'), 'Lock only changes future edits, not pixels');
});

test('relocking a rounded size establishes a new ratio; legacy settings and reset capture their current size', () => {
  const source = { width: 3840, height: 2160 };
  const tiny = changeResizeDimension(settings, source, 'width', 10)!;
  const relocked = toggleResizeAspectRatio(toggleResizeAspectRatio(tiny));
  assert.deepEqual(resizeSize(changeResizeDimension(relocked, resizeSize(tiny, source), 'width', 3840)!, source), { width: 3840, height: 2304 });
  const legacy = restoreResizeData({ settings: { width: 500, height: 688, lockAspectRatio: true } })!.settings;
  const smallCustom = changeResizeDimension(legacy, resizeSize(legacy, source), 'width', 10)!;
  assert.deepEqual(resizeSize(changeResizeDimension(smallCustom, resizeSize(smallCustom, source), 'width', 500)!, source), { width: 500, height: 688 });
  const reset = { lockAspectRatio: tiny.lockAspectRatio };
  const replacement = { width: 768, height: 1376 };
  const smallReset = changeResizeDimension(reset, resizeSize(reset, replacement), 'width', 10)!;
  assert.deepEqual(resizeSize(changeResizeDimension(smallReset, resizeSize(smallReset, replacement), 'width', 768)!, replacement), replacement);
});

test('ratio metadata is validated and persisted but does not invalidate unchanged pixels', () => {
  const next = changeResizeDimension(settings, { width: 3840, height: 2160 }, 'width', 10)!;
  assert.equal(resizeDocument({ settings: next }).settings.aspectRatio, 16 / 9);
  assert.equal(resizeRevision({ settings: next }, 'source'), resizeRevision({ settings: { ...next, aspectRatio: undefined } }, 'source'));
  for (const aspectRatio of [0, -1, NaN, Infinity, '1.5', null]) {
    assert.equal(restoreResizeData({ settings: { ...next, aspectRatio } }), undefined);
  }
});

test('dimensions round to whole pixels, reject unsafe values and retain 4K output', () => {
  const source = { width: 3840, height: 2160 };
  assert.equal(validResizeSize(source), true);
  assert.deepEqual(resizeSize(changeResizeDimension(settings, source, 'width', 1920)!, source), { width: 1920, height: 1080 });
  assert.deepEqual(resizeSize(changeResizeDimension(settings, source, 'width', 1)!, source), { width: 1, height: 1 });
  assert.equal(changeResizeDimension(settings, source, 'width', 1024.4)?.width, 1024);
  for (const value of [NaN, Infinity, -1, 0, 0.1, 16385]) assert.equal(changeResizeDimension(settings, source, 'width', value), undefined);
  assert.equal(validResizeSize({ width: 16384, height: 16384 }), false);
  assert.equal(changeResizeDimension(settings, { width: 1, height: 16384 }, 'width', 2), undefined);
});

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 640, height: 960 });
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const resize: ResizeNode = { id: 'resize', type: 'resize', position: { x: 0, y: 0 }, data: { settings, result: asset('result'), outputRevision: resizeRevision({ settings }, 'input') } };
const input = { id: 'in', source: 'file', sourceHandle: 'file', target: 'resize', targetHandle: 'image' };

test('output rejects stale settings, replacement input, disconnection, invalid handles and cycles', () => {
  assert.deepEqual(imageOutput(resize, 'result', [file, resize], [input]), [resize.data.result]);
  assert.deepEqual(imageOutput(resize, 'image', [file, resize], [input]), []);
  assert.deepEqual(imageOutput(resize, 'result', [file, resize], []), []);
  assert.deepEqual(imageOutput(resize, 'result', [{ ...file, data: { assets: [asset('new')] } }, resize], [input]), []);
  for (const next of [{ ...settings, width: 320, height: 480 }, { ...settings, width: 640, height: 640 }]) {
    const changed = { ...resize, data: { ...resize.data, settings: next } };
    assert.deepEqual(imageOutput(changed, 'result', [file, changed], [input]), []);
  }
  const second: ResizeNode = { ...resize, id: 'second', data: { ...resize.data, result: asset('second'), outputRevision: resizeRevision({ settings }, 'result') } };
  const chain = { id: 'chain', source: 'resize', sourceHandle: 'result', target: 'second', targetHandle: 'image' };
  assert.equal(imageOutput(second, 'result', [file, resize, second], [input, chain])[0].id, 'second');
  assert.deepEqual(imageOutput(second, 'result', [file, { ...resize, data: { ...resize.data, settings: { ...settings, width: 320, height: 480 } } }, second], [input, chain]), []);
  assert.deepEqual(imageOutput(resize, 'result', [resize, second], [chain, { ...input, source: 'second', sourceHandle: 'result' }]), []);
});

test('image connections and recommendations include Resize while rejecting invalid connections', () => {
  assert.equal(canConnect(input, [file, resize], []), true);
  assert.equal(canConnect(input, [file, resize], [input]), false);
  assert.equal(canConnect({ ...input, targetHandle: 'bad' }, [file, resize], []), false);
  assert.equal(canConnect(input, [file, { ...resize, data: { ...resize.data, locked: true } }], []), false);
  for (const source of [{ ...file, type: 'text', data: { text: 'bad' } }, { ...file, data: { assets: [{ ...asset('video'), kind: 'video' }] } }]) {
    assert.equal(canConnect(input, [source as AppNode, resize], []), false);
  }
  for (const type of ['preview', 'crop', 'blur', 'levels', 'color-correction', 'painter', 'invert', 'rotate-flip', 'resize', 'image-describer', 'sunburst']) {
    const target = { id: 'target', type, position: { x: 0, y: 0 }, data: {} } as AppNode;
    const targetHandle = ['preview', 'color-correction'].includes(type) ? 'file' : ['sunburst', 'image-describer'].includes(type) ? 'image-0' : 'image';
    const edge = { source: 'resize', sourceHandle: 'result', target: 'target', targetHandle };
    assert.equal(canConnect(edge, [resize, target], []), true, type);
    assert.equal(canConnect({ ...edge, sourceHandle: 'bad' }, [resize, target], []), false, type);
    assert.equal(canConnect(edge, [resize, target], [{ id: 'cycle', source: 'target', target: 'resize' }]), false, type);
  }
  const pending: PendingConnection = { nodeId: 'file', handleId: 'file', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, [file], []).some(item => item.itemId === 'resize'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'resize', handleId: 'result' }, [resize], []).some(item => item.itemId === 'preview'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'resize', handleId: 'image', direction: 'target' }, [resize], []).some(item => item.itemId === 'file'));
});

test('clipboard validates settings; history excludes output; persistence retains native assets', () => {
  const detached: ResizeNode = { ...resize, data: { ...resize.data, baseImage: asset('input'), locked: true } };
  assert.deepEqual(imageOutput(detached, 'result', [detached], []), [resize.data.result]);
  const restored = restoreResizeData(detached.data)!;
  assert.deepEqual(restored.settings, { ...settings, width: undefined, height: undefined });
  assert.equal(restored.baseImage?.id, 'input');
  assert.equal(restored.locked, false);
  assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined);
  assert.equal('result' in resizeDocument(detached.data), false);
  for (const value of [null, 'bad', {}, { settings: { ...settings, width: 45 } }, { settings: { ...settings, lockAspectRatio: 1 } }, { settings: { ...settings, width: -1, height: 2 } }, { settings: { ...settings, width: Infinity, height: 2 } }, { settings, baseImage: {} }, { settings, baseImage: { ...asset('video'), kind: 'video' } }]) {
    assert.equal(restoreResizeData(value), undefined);
  }
  const [mapped] = mapAssets([detached], image => ({ ...image, url: `${image.url}-restored` }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});
