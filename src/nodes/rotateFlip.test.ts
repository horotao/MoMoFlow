import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRotateFlip, defaultRotateFlipSettings, rotateFlipDocument, rotateFlipRevision, rotateFlipTransform, restoreRotateFlipData, type RotateFlipSettings } from './rotateFlip.ts';
import { imageOutput } from './sunburstRun.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import type { AppNode, RotateFlipNode, FileAsset } from './types';

const settings = defaultRotateFlipSettings;
// Transform pixel centers with the exact matrix used by CanvasRenderingContext2D.
function pixels(value: RotateFlipSettings) {
  const { width, height, matrix: [a, b, c, d, e, f] } = rotateFlipTransform(3, 2, value);
  const output = new Array<string>(width * height);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
    const dx = Math.floor(a * (x + .5) + c * (y + .5) + e);
    const dy = Math.floor(b * (x + .5) + d * (y + .5) + f);
    assert.ok(dx >= 0 && dx < width && dy >= 0 && dy < height);
    output[dy * width + dx] = 'ABCDEF'[y * 3 + x];
  }
  return output.join('');
}

test('non-square image rotates clockwise without clipping and mirrors in the output axes', () => {
  assert.equal(pixels(settings), 'ABCDEF');
  assert.equal(pixels({ ...settings, rotation: 90 }), 'DAEBFC');
  assert.equal(pixels({ ...settings, rotation: 180 }), 'FEDCBA');
  assert.equal(pixels({ ...settings, rotation: 270 }), 'CFBEAD');
  assert.equal(pixels({ ...settings, flipHorizontal: true }), 'CBAFED');
  assert.equal(pixels({ ...settings, flipVertical: true }), 'DEFABC');
  assert.equal(pixels({ ...settings, rotation: 90, flipHorizontal: true }), 'ADBECF');
  assert.equal(pixels({ ...settings, rotation: 90, flipVertical: true }), 'FCEBDA');
  for (const rotation of [0, 90, 180, 270] as const) for (const flipHorizontal of [false, true]) for (const flipVertical of [false, true]) {
    assert.equal(new Set(pixels({ rotation, flipHorizontal, flipVertical })).size, 6);
    const result = rotateFlipTransform(2160, 3840, { rotation, flipHorizontal, flipVertical });
    assert.deepEqual([result.width, result.height], rotation % 180 ? [3840, 2160] : [2160, 3840]);
  }
});

test('four rotations, double mirrors, reset and mixed button order match Weavy settings', () => {
  let current = settings;
  for (let i = 0; i < 4; i++) current = changeRotateFlip(current, 'rotate');
  assert.deepEqual(current, settings);
  for (const action of ['horizontal', 'vertical'] as const) {
    assert.deepEqual(changeRotateFlip(changeRotateFlip(settings, action), action), settings);
    assert.deepEqual(changeRotateFlip(changeRotateFlip(settings, action), 'rotate'), changeRotateFlip(changeRotateFlip(settings, 'rotate'), action));
  }
  assert.deepEqual(changeRotateFlip({ rotation: 270, flipHorizontal: true, flipVertical: true }, 'reset'), settings);
  assert.deepEqual(settings, { rotation: 0, flipHorizontal: false, flipVertical: false });
});

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 640, height: 960 });
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const rotate: RotateFlipNode = { id: 'rotate', type: 'rotate-flip', position: { x: 0, y: 0 }, data: { settings, result: asset('result'), outputRevision: rotateFlipRevision({ settings }, 'input') } };
const input = { id: 'in', source: 'file', sourceHandle: 'file', target: 'rotate', targetHandle: 'image' };

test('output rejects stale settings, replacement input, disconnection, invalid handles and cycles', () => {
  assert.deepEqual(imageOutput(rotate, 'result', [file, rotate], [input]), [rotate.data.result]);
  assert.deepEqual(imageOutput(rotate, 'image', [file, rotate], [input]), []);
  assert.deepEqual(imageOutput(rotate, 'result', [file, rotate], []), []);
  assert.deepEqual(imageOutput(rotate, 'result', [{ ...file, data: { assets: [asset('new')] } }, rotate], [input]), []);
  for (const action of ['rotate', 'horizontal', 'vertical'] as const) {
    const changed = { ...rotate, data: { ...rotate.data, settings: changeRotateFlip(settings, action) } };
    assert.deepEqual(imageOutput(changed, 'result', [file, changed], [input]), []);
  }
  const second: RotateFlipNode = { ...rotate, id: 'second', data: { ...rotate.data, result: asset('second'), outputRevision: rotateFlipRevision({ settings }, 'result') } };
  const chain = { id: 'chain', source: 'rotate', sourceHandle: 'result', target: 'second', targetHandle: 'image' };
  assert.equal(imageOutput(second, 'result', [file, rotate, second], [input, chain])[0].id, 'second');
  assert.deepEqual(imageOutput(second, 'result', [file, { ...rotate, data: { ...rotate.data, settings: changeRotateFlip(settings, 'rotate') } }, second], [input, chain]), []);
  assert.deepEqual(imageOutput(rotate, 'result', [rotate, second], [chain, { ...input, source: 'second', sourceHandle: 'result' }]), []);
});

test('image connections and recommendations include Rotate and flip while rejecting invalid connections', () => {
  assert.equal(canConnect(input, [file, rotate], []), true);
  assert.equal(canConnect(input, [file, rotate], [input]), false);
  assert.equal(canConnect({ ...input, targetHandle: 'bad' }, [file, rotate], []), false);
  assert.equal(canConnect(input, [file, { ...rotate, data: { ...rotate.data, locked: true } }], []), false);
  for (const source of [{ ...file, type: 'text', data: { text: 'bad' } }, { ...file, data: { assets: [{ ...asset('video'), kind: 'video' }] } }]) {
    assert.equal(canConnect(input, [source as AppNode, rotate], []), false);
  }
  for (const type of ['preview', 'crop', 'blur', 'levels', 'color-correction', 'painter', 'invert', 'rotate-flip', 'image-describer', 'sunburst']) {
    const target = { id: 'target', type, position: { x: 0, y: 0 }, data: {} } as AppNode;
    const targetHandle = ['preview', 'color-correction'].includes(type) ? 'file' : ['sunburst', 'image-describer'].includes(type) ? 'image-0' : 'image';
    const edge = { source: 'rotate', sourceHandle: 'result', target: 'target', targetHandle };
    assert.equal(canConnect(edge, [rotate, target], []), true, type);
    assert.equal(canConnect({ ...edge, sourceHandle: 'bad' }, [rotate, target], []), false, type);
    assert.equal(canConnect(edge, [rotate, target], [{ id: 'cycle', source: 'target', target: 'rotate' }]), false, type);
  }
  const pending: PendingConnection = { nodeId: 'file', handleId: 'file', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, [file], []).some(item => item.itemId === 'rotate-flip'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'rotate', handleId: 'result' }, [rotate], []).some(item => item.itemId === 'preview'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'rotate', handleId: 'image', direction: 'target' }, [rotate], []).some(item => item.itemId === 'file'));
});

test('clipboard validates settings; history excludes output; persistence retains native assets', () => {
  const detached: RotateFlipNode = { ...rotate, data: { ...rotate.data, baseImage: asset('input'), locked: true } };
  assert.deepEqual(imageOutput(detached, 'result', [detached], []), [rotate.data.result]);
  const restored = restoreRotateFlipData(detached.data)!;
  assert.deepEqual(restored.settings, settings);
  assert.equal(restored.baseImage?.id, 'input');
  assert.equal(restored.locked, false);
  assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined);
  assert.equal('result' in rotateFlipDocument(detached.data), false);
  for (const value of [null, 'bad', {}, { settings: { ...settings, rotation: 45 } }, { settings: { ...settings, flipHorizontal: 1 } }, { settings, baseImage: {} }, { settings, baseImage: { ...asset('video'), kind: 'video' } }]) {
    assert.equal(restoreRotateFlipData(value), undefined);
  }
  const [mapped] = mapAssets([detached], image => ({ ...image, url: `${image.url}-restored` }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});
