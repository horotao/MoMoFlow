import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSizes, sunburstPresetSize, sunburstResolutions, sunburstSizePreset, sunburstSizePresets, sunburstParameterData, validateSunburstSize } from './sunburst.ts';

test('resolution presets match official square, 2K landscape and 4K dimensions', () => {
  assert.equal(sunburstPresetSize('auto', '2K'), '2048x2048');
  assert.equal(sunburstPresetSize('1024x1024', '4K'), '2880x2880');
  assert.equal(sunburstPresetSize('1536x864', '2K'), '2048x1152');
  assert.equal(sunburstPresetSize('864x1536', '2K'), '1152x2048');
  assert.equal(sunburstPresetSize('1536x864', '4K'), '3840x2160');
  assert.equal(sunburstPresetSize('864x1536', '4K'), '2160x3840');
});

test('every resolution/ratio combination preserves exact ratio and stays within model limits', () => {
  const unique = new Set<string>();
  for (const ratio of imageSizes.filter(value => value !== 'auto')) {
    const [baseWidth, baseHeight] = ratio.split('x').map(Number);
    let previousPixels = 0;
    for (const resolution of sunburstResolutions) {
      const size = sunburstPresetSize(ratio, resolution);
      const [width, height] = size.split('x').map(Number);
      assert.equal(validateSunburstSize(size), size);
      assert.equal(width * baseHeight, height * baseWidth, `${resolution} ${ratio}`);
      assert.ok(width * height > previousPixels, `${resolution} must increase pixel count`);
      previousPixels = width * height;
      if (resolution === '1K') assert.equal(size, ratio, 'Old presets remain unchanged');
      if (resolution === '2K') assert.ok(Math.max(width, height) <= 2048);
      assert.deepEqual(sunburstSizePreset(size), { size, ratio, resolution });
      unique.add(size);
    }
  }
  assert.equal(unique.size, 42);
});

test('custom and unfinished sizes stay distinct from presets; exposed inputs include high resolutions', () => {
  for (const size of ['auto', '1200x1008', '1024x', '1000x1024', '4096x4096']) assert.equal(sunburstSizePreset(size), undefined);
  assert.throws(() => sunburstPresetSize('1200x1008', '2K'), /预设宽高比/);
  const input = sunburstParameterData('size', '3840x2160', 'openai');
  assert.equal(input.model, '3840x2160');
  assert.ok(sunburstSizePresets.every(preset => input.options.includes(preset.size)));
  assert.equal(input.options.length, 43);
  assert.equal(input.options.filter(size => size === '3840x2160').length, 1);
});
