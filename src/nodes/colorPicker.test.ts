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

test('beUI color channels preserve gray hue, black saturation, alpha and HSL boundaries', async () => {
  const { parseHex, formatHex, hsvaToRgba, rgbaToHsva, hsvToHsl, hslToHsv } = await import('./shared/beuiColorPickerMath.ts');
  assert.deepEqual(parseHex('#f803'), { r: 255, g: 136, b: 0, a: .2 });
  assert.equal(formatHex(parseHex('#60a5fa80')!), '#60a5fa80');
  const previous = { h: 240, s: 75, v: 60, a: .37 };
  assert.equal(rgbaToHsva({ r: 128, g: 128, b: 128, a: 1 }, previous).h, 240);
  assert.equal(rgbaToHsva({ r: 0, g: 0, b: 0, a: 1 }, previous).s, 75);
  for (const color of ['#ff0000', '#00ff00', '#0000ff', '#000000', '#ffffff', '#ab12cd']) {
    const hsv = rgbaToHsva(parseHex(color)!, previous);
    const hsl = hsvToHsl(hsv);
    assert.equal(formatHex(hsvaToRgba(hslToHsv(hsl.h, hsl.s, hsl.l, hsv, 1))), color);
  }
  assert.equal(formatHex(hsvaToRgba({ h: 360, s: 100, v: 100, a: 0 })), '#ff000000');
  assert.equal(parseHex('rgba(1, 2, 3, 1)'), null);
});
