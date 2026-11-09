import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVectorSvg } from './vectorSvg.ts';

const wrap = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">${content}</svg>`;
test('pure SVG paths, shapes, text, styles and local gradients remain vector content', () => {
  const svg = wrap('<defs><linearGradient id="ink"><stop stop-color="#123"/></linearGradient></defs><style>.ink{fill:url(#ink)}</style><path class="ink" d="M0 0h10v10z"/><text x="10" y="30">矢量 &amp; SVG</text>');
  assert.deepEqual(validateVectorSvg(svg), { width: 640, height: 480 });
  assert.deepEqual(validateVectorSvg('<?xml version="1.0"?>' + wrap('<rect width="10" height="10"/>').replace('viewBox="0 0 640 480"', 'width="128px" height="96"')), { width: 128, height: 96 });
});
test('SVG rejects raster wrappers, executable content, external references and malformed XML', () => {
  for (const content of [
    '<image href="data:image/png;base64,aGVsbG8="/>', '<feImage href="#local"/>',
    '<script>alert(1)</script>', '<foreignObject><div>hi</div></foreignObject>',
    '<animate attributeName="href" to="https://example.com"/>', '<path onload="alert(1)"/>',
    '<use href="https://example.com/file.svg#p"/>', '<use href="&#100;ata:image/png;base64,aGVsbG8="/>',
    '<path fill="url(https://example.com/a)"/>', '<style>@import "https://example.com";</style>',
    '<style>.a{fill:u<![CDATA[rl(https://example.com/a)]]>}</style>',
    '<path style="fill:u\\72l(https://example.com/a)"/>', '<path>',
  ]) assert.throws(() => validateVectorSvg(wrap(content)), /纯矢量 SVG/, content);
  for (const xml of ['PNG bytes', wrap(''), '<svg><path/></svg>', '<!DOCTYPE svg>' + wrap('<path/>'),
    '<?xml-stylesheet href="https://example.com"?>' + wrap('<path/>'), wrap('<path/>').replace('640 480', 'NaN 480')]) {
    assert.throws(() => validateVectorSvg(xml), /纯矢量 SVG/);
  }
});
