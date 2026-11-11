export type MapRect = { x: number; y: number; width: number; height: number };
export type MapCamera = { x: number; y: number; scale: number };
export const minimapSize = { width: 200, height: 106 };

// Use canvas coordinates, independent of the animated minimap camera.
// A small preference for the current target prevents flicker between neighbors.
export function findMapFocus(viewport: MapRect, nodes: (MapRect & { id: string })[], currentId: string | null) {
  const cx = viewport.x + viewport.width / 2;
  const cy = viewport.y + viewport.height / 2;
  const candidates = nodes.filter(node => node.width > 0 && node.height > 0).map(node => ({
    id: node.id,
    distance: Math.hypot(
      (node.x + node.width / 2 - cx) / Math.max(1, viewport.width * 0.35 + node.width / 2),
      (node.y + node.height / 2 - cy) / Math.max(1, viewport.height * 0.35 + node.height / 2),
    ),
  })).filter(node => node.distance <= 1);
  const nearest = candidates.reduce<(typeof candidates)[number] | undefined>((best, node) =>
    !best || node.distance < best.distance ? node : best, undefined);
  const current = candidates.find(node => node.id === currentId);
  return current && nearest && current.distance <= nearest.distance + 0.12
    ? current.id : nearest?.id ?? null;
}

export function fitMapCamera(viewport: MapRect, nodes: MapRect[]): MapCamera {
  let left = viewport.x;
  let top = viewport.y;
  let right = left + viewport.width;
  let bottom = top + viewport.height;
  for (const node of nodes) {
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }
  const scale = Math.min((minimapSize.width - 16) / Math.max(1, right - left),
    (minimapSize.height - 16) / Math.max(1, bottom - top));
  return { x: (left + right) / 2, y: (top + bottom) / 2, scale };
}

export function projectMapRect(rect: MapRect, camera: MapCamera): MapRect {
  return {
    x: (rect.x - camera.x) * camera.scale + minimapSize.width / 2,
    y: (rect.y - camera.y) * camera.scale + minimapSize.height / 2,
    width: rect.width * camera.scale,
    height: rect.height * camera.scale,
  };
}

export function mapPointToCanvas(point: { x: number; y: number }, camera: MapCamera) {
  return {
    x: (point.x - minimapSize.width / 2) / camera.scale + camera.x,
    y: (point.y - minimapSize.height / 2) / camera.scale + camera.y,
  };
}
