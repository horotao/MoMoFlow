import test from 'node:test';
import assert from 'node:assert/strict';
import { colorTagGlowMetrics, colorTagGlowShadow } from './colorTagGlow.ts';

test('tag highlight keeps its screen-space stroke and reach across canvas zoom and caps tiny nodes', () => {
  for (const zoom of [0.3, 0.69, 1, 2]) {
    const { reach, ring } = colorTagGlowMetrics(zoom, 384, 384);
    assert.ok(Math.abs(reach * zoom - 16) < 1e-10);
    assert.ok(Math.abs(ring * zoom - 2) < 1e-10);
  }
  assert.equal(colorTagGlowMetrics(0.1, 100, 80).reach * 0.1, 2);
});

test('composited glow bands follow the reference quadratic opacity without an opaque halo', () => {
  const shadows = colorTagGlowShadow('#ec5d5e', 16);
  const bands = [...shadows.matchAll(/0 0 0 ([\d.]+)px color\(srgb [\d. ]+ \/ ([\d.e+-]+)\)/g)]
    .map(match => ({ reach: Number(match[1]), alpha: Number(match[2]) }));
  assert.equal(bands.length, 32);
  for (const distance of [0.25, 4.25, 8.25, 12.25, 15.75]) {
    const opacity = 1 - bands.filter(band => band.reach >= distance).reduce((transparent, band) => transparent * (1 - band.alpha), 1);
    assert.ok(Math.abs(opacity - 0.5 * (1 - distance / 16) ** 2) < 1e-10);
  }
  assert.equal(bands[bands.length - 1].reach, 16);
});
