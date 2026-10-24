import type { LayerTransform } from '../compositor';
import type { GraphicSource, Point, VectorPoint } from '../compositorGraphics';
export type PathSource = Extract<GraphicSource, { kind: 'path' }>;
export type PathPatch = { source: PathSource; transform: LayerTransform };
export const PATH_HIT_SIZE = 20;
const rotate = (point: Point, angle: number) => ({ x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) });
export function localDragDelta(dx: number, dy: number, zoom: number, rotation: number) { return rotate({ x: dx / zoom, y: dy / zoom }, -rotation * Math.PI / 180); }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function pixels(source: PathSource, t: LayerTransform) {
  const scale = (p: Point) => ({ x: p.x * t.width, y: p.y * t.height });
  return source.points.map(p => ({ ...scale(p), ...(p.in ? { in: scale(p.in) } : {}), ...(p.out ? { out: scale(p.out) } : {}) }));
}
// Reframe in the original rotated coordinate system: untouched world-space
// anchors stay fixed even when another anchor moves beyond the old bounds.
export function reframePath(source: PathSource, transform: LayerTransform, points: VectorPoint[]): PathPatch | undefined {
  const all = points.flatMap(p => [p, ...(p.in ? [p.in] : []), ...(p.out ? [p.out] : [])]);
  const minX = Math.min(...all.map(p => p.x)) - 2, minY = Math.min(...all.map(p => p.y)) - 2;
  const width = Math.max(1, Math.max(...all.map(p => p.x)) - minX + 2), height = Math.max(1, Math.max(...all.map(p => p.y)) - minY + 2);
  if (!Number.isFinite(width + height) || Math.max(width, height) > 16384) return;
  const shift = rotate({ x: minX + width / 2 - transform.width / 2, y: minY + height / 2 - transform.height / 2 }, transform.rotation * Math.PI / 180);
  const x = transform.x + transform.width / 2 + shift.x - width / 2, y = transform.y + transform.height / 2 + shift.y - height / 2;
  if (Math.max(Math.abs(x), Math.abs(y)) > 1e6) return;
  const normalized = (p: Point) => ({ x: (p.x - minX) / width, y: (p.y - minY) / height });
  return { source: { ...source, points: points.map(p => ({ ...normalized(p), ...(p.in ? { in: normalized(p.in) } : {}), ...(p.out ? { out: normalized(p.out) } : {}) })) }, transform: { x, y, width, height, rotation: transform.rotation } };
}
export function editPathPoint(source: PathSource, t: LayerTransform, index: number, delta: Point, handle?: 'in' | 'out', shift = false, alt = false): PathPatch | undefined {
  const points = pixels(source, t), p = points[index];
  if (!p) return;
  if (!handle && !alt) {
    if (shift) delta = Math.abs(delta.x) >= Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y };
    const translated = (v: Point) => ({ x: v.x + delta.x, y: v.y + delta.y });
    points[index] = { ...translated(p), ...(p.in ? { in: translated(p.in) } : {}), ...(p.out ? { out: translated(p.out) } : {}) };
  } else {
    let next = handle ? { x: (p[handle] ?? p).x + delta.x, y: (p[handle] ?? p).y + delta.y } : { x: p.x + delta.x, y: p.y + delta.y };
    if (shift) { const a = Math.round(Math.atan2(next.y - p.y, next.x - p.x) / (Math.PI / 4)) * Math.PI / 4, length = distance(next, p); next = { x: p.x + Math.cos(a) * length, y: p.y + Math.sin(a) * length }; }
    const opposite = handle === 'in' ? 'out' : 'in', a = handle && p[handle], b = p[opposite];
    const smooth = a && b && Math.abs((a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x)) < .001 * Math.max(1, distance(a, p) * distance(b, p)) && (a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y) < 0;
    const vector = { x: next.x - p.x, y: next.y - p.y }, length = Math.hypot(vector.x, vector.y);
    points[index] = { ...p, [handle ?? 'out']: next };
    if (!handle || (!alt && smooth && b && length > .001)) {
      const ratio = !handle ? 1 : distance(b!, p) / length;
      points[index][opposite] = { x: p.x - vector.x * ratio, y: p.y - vector.y * ratio };
    }
  }
  return reframePath(source, t, points);
}
export function togglePathCorner(source: PathSource, t: LayerTransform, index: number): PathPatch | undefined {
  const points = pixels(source, t), p = points[index];
  if (p.in || p.out) points[index] = { x: p.x, y: p.y };
  else {
    const previous = points[index - 1] ?? (source.closed ? points[points.length - 1] : p), next = points[index + 1] ?? (source.closed ? points[0] : p);
    const angle = Math.atan2(next.y - previous.y, next.x - previous.x), length = (distance(p, previous) + distance(p, next)) / 6;
    points[index] = { ...p, in: { x: p.x - Math.cos(angle) * length, y: p.y - Math.sin(angle) * length }, out: { x: p.x + Math.cos(angle) * length, y: p.y + Math.sin(angle) * length } };
  }
  return reframePath(source, t, points);
}
// De Casteljau splitting adds an anchor without changing the original curve.
export function splitPathSegment(source: PathSource, index: number, t = .5): PathSource {
  const nextIndex = (index + 1) % source.points.length, a = source.points[index], b = source.points[nextIndex];
  const points = [...source.points];
  let point: VectorPoint;
  if (!a.out && !b.in) point = mix(a, b, t);
  else {
    const q0 = mix(a, a.out ?? a, t), q1 = mix(a.out ?? a, b.in ?? b, t), q2 = mix(b.in ?? b, b, t), r0 = mix(q0, q1, t), r1 = mix(q1, q2, t);
    point = { ...mix(r0, r1, t), in: r0, out: r1 }; points[index] = { ...a, out: q0 }; points[nextIndex] = { ...b, in: q2 };
  }
  points.splice(index + 1, 0, point); return { ...source, points };
}

export function nearestSegmentParameter(a: VectorPoint, b: VectorPoint, target: Point, width: number, height: number) {
  const at = (t: number) => {
    if (!a.out && !b.in) return mix(a, b, t);
    const q0 = mix(a, a.out ?? a, t), q1 = mix(a.out ?? a, b.in ?? b, t), q2 = mix(b.in ?? b, b, t);
    return mix(mix(q0, q1, t), mix(q1, q2, t), t);
  };
  const error = (t: number) => { const p = at(t); return ((p.x - target.x) * width) ** 2 + ((p.y - target.y) * height) ** 2; };
  let best = 0;
  for (let i = 1; i <= 64; i++) if (error(i / 64) < error(best)) best = i / 64;
  let left = Math.max(0, best - 1 / 64), right = Math.min(1, best + 1 / 64);
  for (let i = 0; i < 20; i++) { const a = left + (right - left) / 3, b = right - (right - left) / 3; if (error(a) < error(b)) right = b; else left = a; }
  return Math.max(.001, Math.min(.999, (left + right) / 2));
}
