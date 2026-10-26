import test from 'node:test';
import assert from 'node:assert/strict';
import { blendChannel, blendPixels, blendModes, blendRevision, restoreBlendData, defaultBlendSettings, srgbToLinear } from './blend.ts';
import { blendInputs, imageOutput } from './sunburstRun.ts';
import { canConnect } from './connectionRules.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import type { AppNode, BlendNode, FileAsset } from './types';
const asset = (id: string): FileAsset => ({ id, kind: 'image', name: `${id}.png`, url: `blob:${id}`, width: 100, height: 50 });
const back = asset('back'), front = asset('front'), result = asset('result');
const blend: BlendNode = { id: 'blend', type: 'blend', position: { x: 0, y: 0 }, data: { settings: { ...defaultBlendSettings }, back, front, result, outputRevision: blendRevision(defaultBlendSettings, back, front) } };
const pixel = (values: number[]) => new Uint8ClampedArray(values);
test('Blend implements all 18 modes, asymmetric order, and singularities', () => {
  assert.equal(blendModes.length, 18);
  const expected = [ .8, .2, .16, 0, .8, 1, .84, 1, .32, .68, .2 + .6 * (Math.sqrt(.2) - .2), .6, .68, .25 ];
  // The target Soft Light uses sqrt even below 0.25.
  blendModes.slice(0, 14).forEach((mode, index) => assert.ok(Math.abs(blendChannel(.2, .8, mode) - expected[index]) < 1e-10, mode));
  assert.equal(blendChannel(0, 0, 'Divide'), 0);
  assert.equal(blendChannel(1, 0, 'Color Burn'), 0);
  assert.equal(blendChannel(0, 1, 'Color Dodge'), 1);
  assert.notEqual(blendChannel(.2, .8, 'Overlay'), blendChannel(.8, .2, 'Overlay'));
  for (const mode of blendModes) {
    assert.deepEqual(blendPixels(pixel([50, 100, 150, 255]), pixel([255, 0, 80, 255]), { mode, opacity: 0 }), pixel([50, 100, 150, 255]));
    assert.equal(blendPixels(pixel([10, 20, 30, 0]), pixel([40, 80, 120, 255]), { mode, opacity: .5 })[3], 128);
    assert.deepEqual(blendPixels(pixel([10, 20, 30, 0]), pixel([255, 0, 0, 0]), { mode, opacity: 1 }), pixel([0, 0, 0, 0]));
  }
});
test('Blend alpha uses source-over with front opacity, not RGB interpolation alone', () => {
  assert.deepEqual(blendPixels(pixel([0, 0, 255, 255]), pixel([255, 0, 0, 128]), { mode: 'Normal', opacity: .5 }), pixel([137, 0, 224, 255]));
  assert.deepEqual(blendPixels(pixel([0, 0, 255, 128]), pixel([255, 0, 0, 128]), { mode: 'Normal', opacity: 1 }), pixel([213, 0, 156, 192]));
  assert.throws(() => blendPixels(pixel([1]), pixel([1]), defaultBlendSettings));
});
test('Color modes preserve the selected linear HSL lightness', () => {
  const b = pixel([70, 130, 190, 255]), f = pixel([180, 60, 90, 255]);
  const lightness = (c: Uint8ClampedArray) => {
    const rgb = [...c.slice(0, 3)].map(v => srgbToLinear(v / 255));
    return (Math.min(...rgb) + Math.max(...rgb)) / 2;
  };
  for (const mode of ['Hue', 'Saturation', 'Color', 'Luminosity'] as const) {
    const out = blendPixels(b, f, { mode, opacity: 1 });
    assert.ok(Math.abs(lightness(out) - lightness(mode === 'Luminosity' ? f : b)) < .003, mode);
  }
});
test('Blend output invalidates on either source, settings, disconnect or pending upstream', () => {
  assert.deepEqual(imageOutput(blend, 'result', [blend], []), [result]);
  assert.deepEqual(imageOutput({ ...blend, data: { ...blend.data, outputRevision: JSON.stringify(['blend-v1', back.id, front.id, 'Normal', 1]) } }, 'result', [blend], []), []);
  assert.deepEqual(imageOutput(blend, 'front', [blend], []), []);
  for (const data of [{ ...blend.data, back: undefined }, { ...blend.data, front: asset('new') }, { ...blend.data, settings: { mode: 'Multiply' as const, opacity: 1 } }]) {
    assert.deepEqual(imageOutput({ ...blend, data }, 'result', [blend], []), []);
  }
  const edge = { id: 'e', source: 'missing', sourceHandle: 'file', target: 'blend', targetHandle: 'front' };
  assert.ok(blendInputs(blend, [blend], [edge]).pending);
  assert.deepEqual(imageOutput(blend, 'result', [blend], [edge]), []);
  assert.deepEqual(imageOutput(blend, 'result', [blend], [{ ...edge, source: 'blend', sourceHandle: 'result' }]), []);
});
test('Blend connections accept image ports and reject occupied ports, text, locks and cycles', () => {
  const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [back] } };
  const nodes = [file, blend];
  for (const handle of ['back', 'front']) {
    const e = { id: handle, source: 'file', sourceHandle: 'file', target: 'blend', targetHandle: handle };
    assert.ok(canConnect(e, nodes, [])); assert.equal(canConnect(e, nodes, [e]), false);
    assert.equal(canConnect(e, [file, { ...blend, data: { ...blend.data, locked: true } }], []), false);
  }
  for (const type of ['preview', 'resize', 'crop', 'compare', 'blend', 'image-describer']) {
    const target = { id: 'target', type, position: { x: 0, y: 0 }, data: {} } as AppNode;
    const targetHandle = type === 'preview' ? 'file' : type === 'compare' ? 'input-1' : type === 'blend' ? 'front' : type === 'image-describer' ? 'image-0' : 'image';
    const e = { source: 'blend', sourceHandle: 'result', target: 'target', targetHandle };
    assert.ok(canConnect(e, [blend, target], []), type);
    assert.equal(canConnect({ ...e, sourceHandle: 'back' }, [blend, target], []), false);
  }
});
test('Blend validates clipboard settings and preserves all three assets during persistence', () => {
  assert.equal(restoreBlendData({ ...blend.data, settings: { mode: 'invalid', opacity: 1 } }), undefined);
  assert.equal(restoreBlendData({ ...blend.data, settings: { mode: 'Normal', opacity: NaN } }), undefined);
  assert.equal(restoreBlendData({ ...blend.data, front: { ...front, kind: 'video' } }), undefined);
  const restored = restoreBlendData({ ...blend.data, locked: true })!;
  assert.equal(restored.locked, false); assert.equal(restored.result, undefined);
  assert.deepEqual([...nodeAssetUrls([blend])].sort(), ['blob:back', 'blob:front', 'blob:result']);
  const mapped = mapAssets([blend], asset => ({ ...asset, url: `stored:${asset.id}` }))[0] as BlendNode;
  assert.equal(mapped.data.front?.url, 'stored:front'); assert.equal(mapped.data.back?.url, 'stored:back'); assert.equal(mapped.data.result?.url, 'stored:result');
});
