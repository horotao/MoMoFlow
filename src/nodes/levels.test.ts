import test from 'node:test';
import assert from 'node:assert/strict';
import { levelsRevision, defaultLevelsSettings, restoreLevelsData } from './levels.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { previewImages } from './preview.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { AppNode, LevelsNode, FileAsset } from './types';

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 1200, height: 800 });
const file: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('input')] } };
const color: LevelsNode = { id: 'color', type: 'levels', position: { x: 0, y: 0 },
  data: { channel: 'RGB', settings: { ...defaultLevelsSettings }, result: asset('result'), outputRevision: levelsRevision({ settings: defaultLevelsSettings }, 'input') } };
const input = { id: 'in', source: 'image', sourceHandle: 'file', target: 'color', targetHandle: 'image' };
test('downstream output invalidates on changes, disconnection and upstream replacement, including chains', () => {
  const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
  const output = { id: 'out', source: 'color', sourceHandle: 'result', target: 'preview', targetHandle: 'file' };
  assert.deepEqual(previewImages('preview', [file, color, preview], [input, output]), [color.data.result]);
  assert.deepEqual(previewImages('preview', [file, color, preview], [output]), []);
  assert.deepEqual(imageOutput(color, 'invalid', [file, color], [input]), []);
  const second: LevelsNode = { ...color, id: 'second', data: { ...color.data, result: asset('second'), outputRevision: levelsRevision(color.data, 'result') } };
  const edges = [input, { id: 'chain', source: 'color', sourceHandle: 'result', target: 'second', targetHandle: 'image' }];
  assert.equal(imageOutput(second, 'result', [file, color, second], edges)[0].id, 'second');
  const changed: LevelsNode = { ...color, data: { ...color.data, settings: { ...color.data.settings, RGB: { ...color.data.settings.RGB, gamma: 2 } } } };
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
  const second: LevelsNode = { ...color, id: 'second' };
  const connection = { ...input, source: 'second', sourceHandle: 'result' };
  assert.equal(canConnect(connection, [color, second], []), true);
  assert.equal(canConnect({ ...connection, sourceHandle: 'bad' }, [color, second], []), false);
  assert.equal(canConnect(connection, [color, second], [{ id: 'cycle', source: 'color', target: 'second' }]), false);
  const pending: PendingConnection = { nodeId: 'color', handleId: 'result', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, [color], []).some(item => item.itemId === 'preview'));
  assert.ok(connectionChoices({ ...pending, nodeId: 'image', handleId: 'file' }, [file], []).some(item => item.itemId === 'levels'));
  assert.ok(connectionChoices({ ...pending, direction: 'target', handleId: 'image' }, [color], []).some(item => item.itemId === 'crop'));
});
test('clipboard validation strips derived outputs; persistence maps and retains both images', () => {
  const detached: LevelsNode = { ...color, data: { ...color.data, baseImage: asset('input') } };
  assert.equal(imageOutput(detached, 'result', [detached], [])[0].id, 'result');
  const restored = restoreLevelsData(detached.data)!;
  assert.deepEqual(restored.settings, defaultLevelsSettings);
  assert.equal(restored.baseImage?.id, 'input'); assert.equal(restored.result, undefined);
  assert.equal(restored.outputRevision, undefined); assert.equal(restored.locked, undefined);
  const [mapped] = mapAssets([detached], image => ({ ...image, url: `${image.url}-restored` }));
  assert.deepEqual([...nodeAssetUrls([mapped])], ['blob:result-restored', 'blob:input-restored']);
});


test('identity preserves every byte and alpha; collapsed input ranges stay finite', async () => {
  const { levelsPixels } = await import('./levels.ts');
  const pixels = Uint8ClampedArray.from({ length: 1024 }, (_, i) => Math.floor(i / 4));
  assert.deepEqual(levelsPixels(pixels, defaultLevelsSettings), pixels);
  const settings = structuredClone(defaultLevelsSettings);
  settings.RGB.inputMin = settings.RGB.inputMax = 128;
  assert.deepEqual([...levelsPixels(new Uint8ClampedArray([0, 128, 255, 17]), settings)], [0, 0, 255, 17]);
  settings.RGB.inputMin = settings.RGB.inputMax = 255;
  assert.deepEqual([...levelsPixels(new Uint8ClampedArray([0, 128, 255, 17]), settings)], [0, 0, 0, 17]);
});

test('Weavy reference pixels: linear gamma and individual channels before the master', async () => {
  const { levelsPixels } = await import('./levels.ts');
  // Captured from the same 768 × 1026 reference at x=500, y=600.
  // Allow the reference renderer's one-byte GPU quantization difference.
  const source = new Uint8ClampedArray([157, 128, 121, 255]);
  const cases = [
    { gamma: 2, red: {}, expected: [200, 181, 177] },
    { gamma: .5, red: {}, expected: [95, 61, 54] },
    { gamma: 2, red: { inputMin: 64 }, expected: [157, 181, 177] },
    { gamma: 2, red: { outputMin: 64 }, expected: [219, 181, 177] },
    { gamma: 2, red: { gamma: 2 }, expected: [226, 181, 177] },
  ];
  for (const { gamma, red, expected } of cases) {
    const settings = structuredClone(defaultLevelsSettings);
    settings.RGB.gamma = gamma;
    Object.assign(settings.R, red);
    const result = levelsPixels(source, settings);
    expected.forEach((value, index) => assert.ok(Math.abs(result[index] - value) <= 1, `${result} versus ${expected}`));
    assert.equal(result[3], 255);
  }
});

test('single-channel settings stay independent and reversed/flat outputs compose in linear light', async () => {
  const { levelsPixels, updateChannelLevels } = await import('./levels.ts');
  const pixels = new Uint8ClampedArray([0, 128, 255, 128]);
  let settings = updateChannelLevels(defaultLevelsSettings, 'R', 'gamma', 2);
  assert.deepEqual([...levelsPixels(pixels, settings)], [0, 128, 255, 128]);
  settings = updateChannelLevels(settings, 'B', 'outputMin', 255);
  settings = updateChannelLevels(settings, 'B', 'outputMax', 0);
  assert.equal(levelsPixels(pixels, settings)[2], 0);
  settings = updateChannelLevels(settings, 'G', 'outputMin', 128);
  settings = updateChannelLevels(settings, 'G', 'outputMax', 128);
  assert.equal(levelsPixels(pixels, settings)[1], 188);
  assert.deepEqual(defaultLevelsSettings.G, { inputMin: 0, inputMax: 255, gamma: 1, outputMin: 0, outputMax: 255 });
});

test('histograms use display luminance, alpha weighting and the adjusted pixels', async () => {
  const { levelsHistogram, levelsPixels } = await import('./levels.ts');
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 128]);
  const bins = levelsHistogram(pixels);
  assert.equal(bins.R[255], 1); assert.equal(bins.G[255], 0); assert.equal(bins.B[255], 128 / 255);
  assert.equal(bins.RGB[76], 1); assert.equal(bins.RGB[29], 128 / 255);
  const settings = structuredClone(defaultLevelsSettings);
  settings.R.outputMax = 0;
  const adjusted = levelsHistogram(levelsPixels(pixels, settings));
  assert.equal(adjusted.R[255], 0); assert.equal(adjusted.RGB[76], 0);
  assert.equal(bins.R[255], 1);
});

test('Gamma handle matches reference positions and moves right to brighten', async () => {
  const { levelsGammaPosition, levelsGammaAt } = await import('./levels.ts');
  const settings = defaultLevelsSettings.RGB;
  for (const [gamma, expected] of [[.1, 0], [.5, 89], [1, 128], [2, 166], [10, 255]]) {
    assert.equal(levelsGammaPosition({ ...settings, gamma }), expected);
  }
  assert.equal(levelsGammaPosition({ ...settings, inputMin: 64, gamma: 2 }), 188);
  assert.equal(levelsGammaPosition({ ...settings, gamma: 1 }, false), 127.5, 'compact multi-thumb editor preserves the exact neutral position');
  assert.ok(Math.abs(levelsGammaAt(153, settings) - 1.584893192) < 1e-8);
  assert.equal(levelsGammaAt(128, { ...settings, inputMin: 128, inputMax: 128 }), 1);
});

test('invalid clipboard values are rejected; input endpoints may meet but cannot cross', async () => {
  const { updateChannelLevels, levelsRevision } = await import('./levels.ts');
  for (const gamma of [NaN, Infinity, 0, 11, '1']) assert.equal(restoreLevelsData({ channel: 'RGB', settings: { ...defaultLevelsSettings, RGB: { ...defaultLevelsSettings.RGB, gamma } } }), undefined);
  const settings = updateChannelLevels(defaultLevelsSettings, 'RGB', 'inputMin', 255);
  assert.equal(settings.RGB.inputMin, 255);
  assert.equal(updateChannelLevels(settings, 'RGB', 'inputMax', 0).RGB.inputMax, 255);
  assert.ok(restoreLevelsData({ channel: 'RGB', settings }));
  assert.equal(updateChannelLevels(settings, 'RGB', 'gamma', NaN), settings);
  assert.equal(restoreLevelsData({ channel: 'X', settings }), undefined);
  assert.equal(restoreLevelsData({ channel: 'RGB', settings: { ...settings, R: { ...settings.R, inputMin: 255, inputMax: 254 } } }), undefined);
  assert.equal(levelsRevision({ settings }, 'input'), levelsRevision({ settings: structuredClone(settings) }, 'input'));
});
