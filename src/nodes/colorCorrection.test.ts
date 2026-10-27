import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { colorControls, colorRevision, correctPixels, defaultColorSettings, restoreColorData, type ColorSettings } from './colorCorrection.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { previewImages } from './preview.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { AppNode, ColorCorrectionNode, FileAsset } from './types';

function pixel(rgb: number[], settings: Partial<ColorSettings> = {}) {
  const bytes = new Uint8ClampedArray(rgb);
  correctPixels(bytes, { ...defaultColorSettings, ...settings });
  return [...bytes];
}
test('lookup-table optimization preserves the original correction formula byte for byte', () => {
  // Golden outputs captured from the original native-resolution algorithm.
  const cases: [ColorSettings, string][] = [
    [{ ...defaultColorSettings, exposure: .4 }, 'bf824863581f86f330ce4d3b51221cc7519510a1745092b0b9a8ed94902e4577'],
    [{ exposure: 1.27, contrast: -33, saturation: 52, temperature: 85, tint: -73, highlights: -58, shadows: 41 },
      '5da9767e40324355bd57d3a0405edae5db562b178809172c2956bf68e5a6a317'],
    [{ exposure: -5, contrast: 100, saturation: 100, temperature: -100, tint: 100, highlights: 100, shadows: -100 },
      'bcfe30823b12d4e7e5fbb4cd403d486db198ec10b856e3b7b97b52068df30978'],
  ];
  for (const [settings, expected] of cases) {
    const pixels = Uint8ClampedArray.from({ length: 8192 }, (_, i) => (i * 73 + Math.floor(i / 11) * 31) % 256);
    correctPixels(pixels, settings);
    assert.equal(createHash('sha256').update(pixels).digest('hex'), expected);
  }
});
test('neutral settings preserve every byte; all adjustments preserve alpha and transparent colors', () => {
  const bytes = Uint8ClampedArray.from({ length: 256 * 4 }, (_, i) => i % 256);
  const original = bytes.slice();
  correctPixels(bytes, defaultColorSettings);
  assert.deepEqual(bytes, original);
  for (const { key, min, max } of colorControls) for (const value of [min, max]) {
    const output = pixel([12, 48, 210, 0, 80, 180, 230, 77], { [key]: value });
    assert.deepEqual(output.slice(0, 4), [12, 48, 210, 0]);
    assert.equal(output[7], 77);
  }
});
test('exposure is linear-light stops; saturation removes color; warm/cool and tint directions are correct', () => {
  const exposed = pixel([100, 100, 100, 255], { exposure: 1 });
  assert.ok(exposed[0] >= 137 && exposed[0] <= 139);
  assert.ok(pixel([100, 100, 100, 255], { exposure: -1 })[0] < 100);
  const gray = pixel([200, 100, 50, 255], { saturation: -100 });
  assert.equal(gray[0], gray[1]); assert.equal(gray[1], gray[2]);
  for (const direction of [-1, 1]) {
    const warm = pixel([128, 128, 128, 255], { temperature: direction * 100 });
    assert.ok((warm[0] - warm[2]) * direction > 0);
    const tint = pixel([128, 128, 128, 255], { tint: direction * 100 });
    assert.ok((tint[0] - tint[1]) * direction > 0);
  }
  assert.ok(pixel([190, 190, 190, 255], { contrast: 80 })[0] > 190);
  assert.ok(pixel([60, 60, 60, 255], { contrast: 80 })[0] < 60);
});
test('highlights and shadows preferentially affect their tonal range in both directions', () => {
  for (const direction of [-1, 1]) {
    const shadow = pixel([40, 40, 40, 255, 215, 215, 215, 255], { shadows: direction * 50 });
    assert.ok(Math.abs(shadow[0] - 40) > Math.abs(shadow[4] - 215));
    assert.ok((shadow[0] - 40) * direction > 0);
    const highlight = pixel([40, 40, 40, 255, 215, 215, 215, 255], { highlights: direction * 50 });
    assert.ok(Math.abs(highlight[0] - 40) < Math.abs(highlight[4] - 215));
    assert.ok((highlight[4] - 215) * direction > 0);
  }
});

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 1200, height: 800 });
const file: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const color: ColorCorrectionNode = { id: 'color', type: 'color-correction', position: { x: 0, y: 0 },
  data: { settings: { ...defaultColorSettings }, result: asset('result'), outputRevision: colorRevision({ settings: defaultColorSettings }, 'input') } };
const input = { id: 'in', source: 'image', sourceHandle: 'file', target: 'color', targetHandle: 'file' };
test('downstream output invalidates on changes, disconnection and upstream replacement, including chains', () => {
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  const output = { id: 'out', source: 'color', sourceHandle: 'result', target: 'preview', targetHandle: 'file' };
  assert.deepEqual(previewImages('preview', [file, color, preview], [input, output]), [color.data.result]);
  assert.deepEqual(previewImages('preview', [file, color, preview], [output]), []);
  assert.deepEqual(imageOutput(color, 'invalid', [file, color], [input]), []);
  const second: ColorCorrectionNode = { ...color, id: 'second', data: { ...color.data, result: asset('second'), outputRevision: colorRevision(color.data, 'result') } };
  const edges = [input, { id: 'chain', source: 'color', sourceHandle: 'result', target: 'second', targetHandle: 'file' }];
  assert.equal(imageOutput(second, 'result', [file, color, second], edges)[0].id, 'second');
  const changed: ColorCorrectionNode = { ...color, data: { ...color.data, settings: { ...color.data.settings, exposure: 1 } } };
  assert.deepEqual(imageOutput(second, 'result', [file, changed, second], edges), []);
  assert.deepEqual(imageOutput(color, 'result', [{ ...file, data: { assets: [asset('replacement')] } }, color], [input]), []);
  const generator: AppNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: 'test' } };
  const run = prepareSunburstRun([file, color, generator, prompt], [input, { id: 'p', source: 'p', target: 'g', targetHandle: 'prompt' },
    { ...output, target: 'g', targetHandle: 'image-0' }], ['g'], 1);
  assert.equal(run.error, undefined);
  assert.deepEqual(run.tasks[0].imageRequest?.images, ['blob:result']);
});
test('connections and recommendations support image tools and reject wrong types, handles, duplicate connections and cycles', () => {
  assert.equal(canConnect(input, [file, color], []), true);
  assert.equal(canConnect(input, [file, color], [input]), false);
  assert.equal(canConnect({ ...input, targetHandle: 'bad' }, [file, color], []), false);
  assert.equal(canConnect(input, [file, { ...color, data: { ...color.data, locked: true } }], []), false);
  assert.equal(canConnect(input, [{ ...file, type: 'text', data: { text: 'bad' } }, color], []), false);
  const second: ColorCorrectionNode = { ...color, id: 'second' };
  const connection = { ...input, source: 'second', sourceHandle: 'result' };
  assert.equal(canConnect(connection, [color, second], []), true);
  assert.equal(canConnect({ ...connection, sourceHandle: 'bad' }, [color, second], []), false);
  assert.equal(canConnect(connection, [color, second], [{ id: 'cycle', source: 'color', target: 'second' }]), false);
  const pending: PendingConnection = { nodeId: 'color', handleId: 'result', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, [color], []).some(item => item.itemId === 'preview'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'image', handleId: 'file' }, [file], []).some(item => item.itemId === 'color-correction'));
  assert.ok(connectionChoices({ ...pending, direction: 'target', handleId: 'file' }, [color], []).some(item => item.itemId === 'crop'));
});
test('clipboard validation strips derived outputs; persistence maps and retains both images', () => {
  const detached: ColorCorrectionNode = { ...color, data: { ...color.data, baseImage: asset('input') } };
  assert.equal(imageOutput(detached, 'result', [detached], [])[0].id, 'result');
  const restored = restoreColorData(detached.data)!;
  assert.deepEqual(restored.settings, defaultColorSettings);
  assert.equal(restored.baseImage?.id, 'input'); assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined); assert.equal(restored.locked, false);
  for (const value of [NaN, Infinity, 6, '1']) assert.equal(restoreColorData({ settings: { ...defaultColorSettings, exposure: value } }), undefined);
  const [mapped] = mapAssets([detached], image => ({ ...image, url: `${image.url}-restored` }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});
