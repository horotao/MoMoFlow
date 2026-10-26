import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { blendModes, blendPixels } from './blend.ts';

// Actual exported Weavy PNG pixels. This oracle does not call our blend formulas.
const fixture = new Uint8ClampedArray(gunzipSync(readFileSync(new URL('../../tests/fixtures/blend-weavy.rgba.bin', import.meta.url))));
const size = 144 * 144 * 4;
const back = fixture.slice(0, size), front = fixture.slice(size, size * 2);
const opacities = [0, .01, .25, .5, .63, 1];
assert.equal(fixture.length, size * (2 + blendModes.length * opacities.length));

for (const [m, mode] of blendModes.entries()) test(`Weavy exported PNG reference: ${mode}, six opacities and 81 alpha pairs`, () => {
  for (const [o, opacity] of opacities.entries()) {
    const actual = blendPixels(back, front, { mode, opacity });
    const index = 2 + m * opacities.length + o;
    const expected = fixture.subarray(index * size, (index + 1) * size);
    let sum = 0, max = 0, maxAlpha = 0;
    for (let i = 0; i < size; i += 4) {
      maxAlpha = Math.max(maxAlpha, Math.abs(actual[i + 3] - expected[i + 3]));
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(actual[i + c] * actual[i + 3] - expected[i + c] * expected[i + 3]) / 255;
        sum += error; max = Math.max(max, error);
      }
    }
    // GPU half-float rendering and PNG quantization have bounded differences.
    // Check the mean AND worst pixel so a small set of severe errors cannot hide.
    assert.ok(maxAlpha <= 1, `${mode}/${opacity}: alpha ${maxAlpha}`);
    assert.ok(max <= 6.01, `${mode}/${opacity}: worst premultiplied RGB ${max}`);
    assert.ok(sum / (size / 4 * 3) <= .12, `${mode}/${opacity}: mean RGB ${sum / (size / 4 * 3)}`);
  }
});
