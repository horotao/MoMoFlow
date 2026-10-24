import type { CompositorLayout, LayerTransform } from '../compositor';

export const resizeHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = typeof resizeHandles[number];
export type SnapGuide = { axis: 'x' | 'y'; value: number };
export type SnapTargets = { x: number[]; y: number[] };

export function layerBounds(t: LayerTransform) {
  const radians = t.rotation * Math.PI / 180, c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
  const width = t.width * c + t.height * s, height = t.width * s + t.height * c;
  const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
  return { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2, cx, cy };
}

// Resolve once at pointer-down. Hidden/empty layers never attract the pointer;
// locked layers still act as useful alignment references.
export function snapTargets(layout: CompositorLayout, selected: string): SnapTargets {
  const x = [0, layout.width / 2, layout.width], y = [0, layout.height / 2, layout.height];
  for (const layer of layout.layers) {
    if (layer.id === selected || !layer.visible || (!layer.asset && ['input', 'asset'].includes(layer.source.kind))) continue;
    const b = layerBounds(layer.transform);
    x.push(b.left, b.cx, b.right); y.push(b.top, b.cy, b.bottom);
  }
  return { x: [...new Set(x)], y: [...new Set(y)] };
}

export function snapMove(t: LayerTransform, targets: SnapTargets, zoom: number, axis?: 'x' | 'y') {
  const b = layerBounds(t), guides: SnapGuide[] = [];
  const nearest = (values: number[], candidates: number[], direction: 'x' | 'y') => {
    if (axis && direction !== axis) return 0;
    let distance = 6 / zoom + 1e-7, offset = 0, target: number | undefined;
    for (const candidate of candidates) for (const value of values) {
      const delta = candidate - value;
      if (Math.abs(delta) < distance) { distance = Math.abs(delta); offset = delta; target = candidate; }
    }
    if (target !== undefined) guides.push({ axis: direction, value: target });
    return offset;
  };
  return { transform: { ...t, x: t.x + nearest([b.left, b.cx, b.right], targets.x, 'x'), y: t.y + nearest([b.top, b.cy, b.bottom], targets.y, 'y') }, guides };
}

// Accumulate short deltas instead of subtracting the initial atan2: crossing
// -180/180 must not jump a whole turn, including when Shift is held.
export function angleDelta(previous: number, next: number) {
  return ((next - previous + 540) % 360) - 180;
}
export function snapRotation(angle: number, stepped: boolean, bypass: boolean) {
  const cardinal = Math.round(angle / 90) * 90;
  return Math.max(-36000, Math.min(36000, stepped ? Math.round(angle / 15) * 15 : !bypass && Math.abs(angle - cardinal) <= 3 ? cardinal : Math.round(angle * 10) / 10));
}
export function resizeCursor(handle: ResizeHandle, rotation: number) {
  const direction = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }[handle];
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][((Math.round((direction + rotation) / 45) % 4) + 4) % 4];
}
export function sameTransform(a: LayerTransform, b: LayerTransform) {
  return (Object.keys(a) as (keyof LayerTransform)[]).every(key => Math.abs(a[key] - b[key]) < 1e-7);
}
