import type { CompositorLayer, LayerTransform } from './compositor';

export const shapeKinds = ['rectangle', 'ellipse', 'triangle', 'star'] as const;
export type ShapeKind = typeof shapeKinds[number];
export type EditorTool = 'select' | 'hand' | 'text' | 'pen' | ShapeKind;
export type Point = { x: number; y: number };
export type VectorPoint = Point & { in?: Point; out?: Point };
export const graphicFonts = ['Text Node Inter', 'Arial', 'Georgia', 'Courier New', 'sans-serif'] as const;
export type GraphicSource =
  | { kind: 'shape'; shape: ShapeKind; fill: string | null }
  | { kind: 'path'; points: VectorPoint[]; closed: boolean; fill: string | null }
  | { kind: 'text'; text: string; fill: string | null; fontFamily: typeof graphicFonts[number]; fontSize: number; fontWeight: number; fontStyle: 'normal' | 'italic'; lineHeight: number; letterSpacing: number; align: 'left' | 'center' | 'right'; verticalAlign: 'top' | 'center' | 'bottom' };
export const MAX_VECTOR_POINTS = 2048;
export const MAX_TEXT_LENGTH = 10000;
export function defaultText(): Extract<GraphicSource, { kind: 'text' }> {
  return { kind: 'text', text: 'Text', fill: '#000000', fontFamily: 'Text Node Inter', fontSize: 100, fontWeight: 400, fontStyle: 'normal', lineHeight: 1.2, letterSpacing: 0, align: 'left', verticalAlign: 'top' };
}
export function isGraphicSource(value: unknown): value is GraphicSource {
  if (!value || typeof value !== 'object') return false;
  const s = value as GraphicSource;
  const finite = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
  const point = (p: Point) => p && finite(p.x, -100, 100) && finite(p.y, -100, 100);
  if (s.fill !== null && (typeof s.fill !== 'string' || !/^#[0-9a-f]{6}$/i.test(s.fill))) return false;
  if (s.kind === 'shape') return shapeKinds.includes(s.shape);
  if (s.kind === 'path') return typeof s.closed === 'boolean' && Array.isArray(s.points) && s.points.length >= 2 && s.points.length <= MAX_VECTOR_POINTS
    && s.points.every(p => point(p) && (!p.in || point(p.in)) && (!p.out || point(p.out)));
  return s.kind === 'text' && typeof s.text === 'string' && s.text.length <= MAX_TEXT_LENGTH && graphicFonts.includes(s.fontFamily)
    && finite(s.fontSize, 1, 2048) && [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(s.fontWeight) && ['normal', 'italic'].includes(s.fontStyle)
    && finite(s.lineHeight, .5, 5) && finite(s.letterSpacing, -100, 500) && ['left', 'center', 'right'].includes(s.align) && ['top', 'center', 'bottom'].includes(s.verticalAlign);
}
export function creationBounds(start: Point, end: Point, square = false, centered = false): LayerTransform {
  let dx = end.x - start.x, dy = end.y - start.y;
  if (square) { const size = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * size; dy = (dy < 0 ? -1 : 1) * size; }
  const width = Math.min(16384, Math.max(1, Math.abs(dx) * (centered ? 2 : 1))), height = Math.min(16384, Math.max(1, Math.abs(dy) * (centered ? 2 : 1)));
  return { x: centered ? start.x - width / 2 : dx < 0 ? start.x - width : start.x, y: centered ? start.y - height / 2 : dy < 0 ? start.y - height : start.y, width, height, rotation: 0 };
}
// Preserve normalized anchors and Bézier handles, not a flattened image.
export function normalizePath(points: VectorPoint[], closed: boolean, padding = 2): { source: Extract<GraphicSource, { kind: 'path' }>; transform: LayerTransform } {
  const all = points.flatMap(p => [p, ...(p.in ? [p.in] : []), ...(p.out ? [p.out] : [])]);
  const minX = Math.min(...all.map(p => p.x)) - padding, minY = Math.min(...all.map(p => p.y)) - padding;
  const width = Math.max(1, Math.max(...all.map(p => p.x)) - minX + padding), height = Math.max(1, Math.max(...all.map(p => p.y)) - minY + padding);
  const normalize = (p: Point) => ({ x: (p.x - minX) / width, y: (p.y - minY) / height });
  return { source: { kind: 'path', points: points.map(p => ({ ...normalize(p), ...(p.in ? { in: normalize(p.in) } : {}), ...(p.out ? { out: normalize(p.out) } : {}) })), closed, fill: null },
    transform: { x: minX, y: minY, width, height, rotation: 0 } };
}
export function pathCommands(points: VectorPoint[], closed: boolean, width = 1, height = 1) {
  if (!points.length) return '';
  const xy = (p: Point) => `${p.x * width} ${p.y * height}`;
  let result = `M ${xy(points[0])}`;
  for (let i = 1; i < points.length + Number(closed); i++) {
    const previous = points[(i - 1) % points.length], current = points[i % points.length];
    result += previous.out || current.in ? ` C ${xy(previous.out ?? previous)} ${xy(current.in ?? current)} ${xy(current)}` : ` L ${xy(current)}`;
  }
  return result + (closed ? ' Z' : '');
}
// Preserve newlines and wrap words; long words and CJK fall back to glyphs.
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const token of paragraph.match(/\s+|[^\s]+/gu) ?? []) {
      if (line && measure(line + token) > width) { lines.push(line.trimEnd()); line = ''; if (/^\s+$/u.test(token)) continue; }
      for (const glyph of Array.from(token)) {
        if (line && measure(line + glyph) > width) { lines.push(line); line = ''; }
        line += glyph;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Transparent room around vectors preserves thick strokes and soft effect edges.
// Disabled blur still reserves the same bounds so toggles can reuse cached rasters.
export function graphicPadding(layer: CompositorLayer) {
  if (!isGraphicSource(layer.source)) return 0;
  const stroke = layer.source.kind === 'path' && layer.stroke.enabled ? layer.stroke.width * ((layer.stroke.join ?? 'miter') === 'miter' ? 5 : 1) : 0;
  return Math.ceil(stroke + layer.effects.reduce((total, effect) => total + (effect.type === 'blur' ? (effect.settings.size - 1) * (effect.settings.type === 'gaussian' ? 2 : .5) + 1 : 0), 0));
}
