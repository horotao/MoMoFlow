import test from 'node:test';
import assert from 'node:assert/strict';
import { blendChannel, blendPixels, blendModes, type BlendMode } from './blend.ts';

// Independent channel-domain reference for the verified Weavy variants.
// Working channels are linear light; Add remains unbounded until compositing.
function reference(b: number, f: number, mode: BlendMode): number {
  const multiply = (x: number, y: number) => x * y / 255;
  const screen = (x: number, y: number) => 255 - multiply(255 - x, 255 - y);
  const hardLight = (x: number, y: number) => y <= 127.5 ? multiply(x, 2 * y) : screen(x, 2 * y - 255);
  switch (mode) {
    case 'Normal': return f;
    case 'Darken': return [b, f].sort((x, y) => x - y)[0];
    case 'Lighten': return [b, f].sort((x, y) => y - x)[0];
    case 'Multiply': return multiply(b, f);
    case 'Screen': return screen(b, f);
    case 'Add': return b + f;
    case 'Divide': return Math.min(255, b * 255 / Math.max(f, .0255));
    case 'Color Burn': return f ? Math.max(0, 255 - (255 - b) * 255 / f) : 0;
    case 'Color Dodge': return f === 255 ? 255 : Math.min(255, b * 255 / (255 - f));
    case 'Overlay': return hardLight(f, b);
    case 'Hard Light': return hardLight(b, f);
    case 'Soft Light': {
      if (f <= 127.5) return b - (255 - 2 * f) * b * (255 - b) / 65025;
      const curve = Math.sqrt(255 * b);
      return b + (2 * f - 255) * (curve - b) / 255;
    }
    case 'Difference': return Math.max(b, f) - Math.min(b, f);
    case 'Exclusion': return multiply(b, 255 - f) + multiply(f, 255 - b);
    default: throw new Error('Nonseparable reference belongs to browser RGB audit');
  }
}
for (const mode of blendModes.slice(0, 14)) test(`Blend linear math: all 65,536 channel pairs for ${mode}`, () => {
  let maxError = 0;
  for (let b = 0; b < 256; b++) for (let f = 0; f < 256; f++) {
    const actual = blendChannel(b / 255, f / 255, mode) * 255;
    assert.ok(Number.isFinite(actual) && actual >= -1e-10 && actual <= (mode === 'Add' ? 510 : 255) + 1e-10);
    maxError = Math.max(maxError, Math.abs(actual - reference(b, f, mode)));
  }
  assert.ok(maxError < 1e-9, `${mode}: ${maxError}`);
});
test('Blend linear math: linear layer compositing across every alpha byte and six opacity levels', () => {
  const b = new Uint8ClampedArray(65536 * 4), f = new Uint8ClampedArray(b.length);
  for (let ba = 0; ba < 256; ba++) for (let fa = 0; fa < 256; fa++) {
    const i = (ba * 256 + fa) * 4; b.set([73, 122, 208, ba], i); f.set([221, 95, 41, fa], i);
  }
  for (const opacity of [0, .01, .25, .5, .63, 1]) for (const mode of blendModes.slice(0, 14)) {
    const actual = blendPixels(b, f, { mode, opacity });
    for (let i = 0; i < actual.length; i += 4) {
      const frontArea = f[i + 3] * opacity * 255;
      const onlyBack = (255 - f[i + 3] * opacity) * b[i + 3];
      const area = frontArea + onlyBack;
      assert.ok(Math.abs(actual[i + 3] - area / 255) <= .5000000001);
      for (let c = 0; c < 3; c++) {
        const decode = (v: number) => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
        const base = b[i + 3] ? decode(b[i + c] / 255) * 255 : 0;
        const front = decode(f[i + c] / 255) * 255;
        const value = area ? (frontArea * reference(base, front, mode) + onlyBack * base) / area / 255 : 0;
        const encoded = value <= .0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - .055;
        const expected = Math.max(0, Math.min(255, encoded * 255));
        assert.ok(Math.abs(actual[i + c] - expected) <= .5000000001, `${mode} alpha at ${i / 4}`);
      }
    }
  }
});
test('Blend nonseparable modes: known saturated colors, gray invariants and transparent front', () => {
  const pixel = (values: number[]) => new Uint8ClampedArray(values);
  const b = pixel([255, 0, 0, 255]), f = pixel([0, 0, 255, 255]);
  const cases = { Hue: [0, 0, 255, 255], Saturation: [255, 0, 0, 255], Color: [0, 0, 255, 255], Luminosity: [255, 0, 0, 255] };
  for (const [mode, expected] of Object.entries(cases)) {
    const result = blendPixels(b, f, { mode: mode as BlendMode, opacity: 1 });
    assert.ok(result.every((value, i) => Math.abs(value - expected[i]) <= 1), mode);
    for (let gray = 0; gray < 256; gray++) {
      const back = pixel([gray, gray, gray, 255]);
      assert.deepEqual(blendPixels(back, pixel([1, 250, 80, 0]), { mode: mode as BlendMode, opacity: 1 }), back);
      if (mode === 'Hue') assert.deepEqual(blendPixels(back, f, { mode: mode as BlendMode, opacity: 1 }), back);
    }
  }
});
