import { SaxesParser } from 'saxes';

const svgNamespace = 'http://www.w3.org/2000/svg';
const elements = new Set('svg g defs title desc metadata path rect circle ellipse line polyline polygon text tspan textPath use symbol clipPath mask pattern linearGradient radialGradient stop marker filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence style'.split(' '));
const shapes = new Set('path rect circle ellipse line polyline polygon text use'.split(' '));
const failure = () => new Error('未返回有效的纯矢量 SVG：不允许位图、脚本、动画或外部资源。');

// Parse XML rather than trusting a MIME type or filename. Preserve the accepted
// original bytes; never rasterize or silently strip part of the provider output.
export function validateVectorSvg(xml: string): { width: number; height: number } {
  if (!xml || xml.length > 16 * 1024 * 1024) throw failure();
  let root = false, vector = false;
  const dimensions = { width: 300, height: 150 };
  const css = (value: string) => {
    if (/[@\\]|(?:expression|image|image-set|-webkit-image-set|cross-fade|src|paint)\s*\(|-moz-binding/i.test(value)) throw failure();
    const remaining = value.replace(/url\(\s*(['"]?)#[a-zA-Z_][\w:.-]*\1\s*\)/g, '');
    if (/url\s*\(/i.test(remaining)) throw failure();
  };
  const parser = new SaxesParser({ xmlns: true });
  let inStyle = false;
  let styleText = '';
  parser.on('error', () => { throw failure(); });
  parser.on('doctype', () => { throw failure(); });
  parser.on('processinginstruction', () => { throw failure(); });
  parser.on('opentag', tag => {
    if (inStyle) throw failure();
    if (tag.uri !== svgNamespace || !elements.has(tag.local)) throw failure();
    if (!root) {
      if (tag.local !== 'svg') throw failure();
      root = true;
      const attrs = Object.fromEntries(Object.values(tag.attributes).map(attr => [attr.name, attr.value]));
      const box = attrs.viewBox?.trim().split(/[\s,]+/).map(Number);
      const length = (value: string | undefined) => value && /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? Number.parseFloat(value) : undefined;
      const width = length(attrs.width) ?? (box?.length === 4 ? box[2] : undefined);
      const height = length(attrs.height) ?? (box?.length === 4 ? box[3] : undefined);
      if (width !== undefined) dimensions.width = width;
      if (height !== undefined) dimensions.height = height;
      if (![dimensions.width, dimensions.height].every(n => Number.isFinite(n) && n > 0 && n <= 32768)) throw failure();
    }
    if (shapes.has(tag.local)) vector = true;
    inStyle = tag.local === 'style';
    for (const attr of Object.values(tag.attributes)) {
      if (attr.uri === 'http://www.w3.org/2000/xmlns/') continue;
      if (attr.uri && attr.uri !== 'http://www.w3.org/1999/xlink' && attr.uri !== 'http://www.w3.org/XML/1998/namespace') throw failure();
      if (/^on/i.test(attr.local) || ['base', 'src'].includes(attr.local)) throw failure();
      if (attr.local === 'href' && !/^#[a-zA-Z_][\w:.-]*$/.test(attr.value)) throw failure();
      css(attr.value);
    }
  });
  parser.on('closetag', tag => {
    if (tag.local === 'style') { css(styleText); styleText = ''; inStyle = false; }
  });
  parser.on('text', value => { if (inStyle) styleText += value; });
  parser.on('cdata', value => { if (inStyle) styleText += value; });
  try { parser.write(xml).close(); } catch { throw failure(); }
  if (!root || !vector) throw failure();
  return dimensions;
}
