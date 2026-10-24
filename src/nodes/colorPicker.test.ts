import test from 'node:test';
import assert from 'node:assert/strict';
import { colorFromHex, colorToHex, normalizeHexColor } from './colorPicker.ts';

test('shared Painter and Compositor color conversion retains RGB pixels across hue sectors and grays', () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    const hsv = colorFromHex(hex);
    assert.equal(colorToHex(hsv.h, hsv.s, hsv.v), hex);
  }
  assert.equal(colorToHex(360, 1, 1), '#ff0000');
  assert.equal(colorToHex(240, 0, 1), '#ffffff');
  assert.equal(colorToHex(120, 1, 0), '#000000');
});

test('HEX entry accepts complete colors and rejects incomplete or unsupported values', () => {
  assert.equal(normalizeHexColor(' #Ab12EF '), '#ab12ef');
  assert.equal(normalizeHexColor('F80'), '#ff8800');
  for (const text of ['', '#', '12', '1234', '12345', '12345678', 'abcdefg', 'red', '##ffffff']) assert.equal(normalizeHexColor(text), undefined);
});
