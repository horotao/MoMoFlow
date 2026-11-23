import type { Edge, Node, XYPosition } from '@xyflow/react';
import { canvasGridGap } from './canvasGrid.ts';

type LayoutNode = Node;
type LayoutLink = Pick<Edge, 'source' | 'target'>;
export type CanvasAlignment = 'left' | 'center' | 'right' | 'justifyHorizontal'
  | 'top' | 'middle' | 'bottom' | 'justifyVertical';
const gap = 64;
const size = (node: LayoutNode) => ({
  width: node.measured?.width ?? node.width ?? 288,
  height: node.measured?.height ?? node.height ?? 240,
});

function anchorOffset(node: LayoutNode) {
  const { width, height } = size(node);
  const [x, y] = node.origin ?? [0, 0];
  return { x: width * x, y: height * y };
}

function topLeft(node: LayoutNode) {
  const offset = anchorOffset(node);
  return { x: node.position.x - offset.x, y: node.position.y - offset.y };
}

function selectedLayoutNodes<T extends LayoutNode>(nodes: T[]) {
  // Nested nodes keep their parent-relative coordinate system untouched.
  const lockedParents = new Set(nodes.filter(node => node.parentId && node.data.locked).map(node => node.parentId));
  return nodes.filter(node => node.selected && !node.data.locked && !node.hidden && !node.parentId && !lockedParents.has(node.id));
}

export function alignmentNodeCount(nodes: LayoutNode[]) {
  return nodes.some(node => node.dragging) ? 0 : selectedLayoutNodes(nodes).length;
}

export function alignSelectedNodes<T extends LayoutNode>(nodes: T[], action: CanvasAlignment): T[] {
  if (nodes.some(node => node.dragging)) return nodes;
  const selected = selectedLayoutNodes(nodes);
  const distribute = action === 'justifyHorizontal' || action === 'justifyVertical';
  if (selected.length < (distribute ? 3 : 2)) return nodes;

  const axis = action === 'left' || action === 'center' || action === 'right' || action === 'justifyHorizontal' ? 'x' : 'y';
  const crossAxis = axis === 'x' ? 'y' : 'x';
  const dimension = axis === 'x' ? 'width' : 'height';
  const items = selected.map(node => {
    const offset = anchorOffset(node);
    return {
      id: node.id,
      start: node.position[axis] - offset[axis],
      cross: node.position[crossAxis] - offset[crossAxis],
      length: size(node)[dimension],
      offset: offset[axis],
      coordinate: node.position[axis],
    };
  });
  const changes = new Map<string, number>();
  const move = (item: typeof items[number], start: number) => {
    const coordinate = start + item.offset;
    if (start !== item.start && coordinate !== item.coordinate) changes.set(item.id, coordinate);
  };

  if (distribute) {
    items.sort((a, b) => a.start - b.start || a.cross - b.cross || a.id.localeCompare(b.id));
    const first = items[0], last = items[items.length - 1];
    const middle = items.slice(1, -1);
    const occupied = middle.reduce((total, item) => total + item.length, 0);
    const spacing = (last.start - first.start - first.length - occupied) / (items.length - 1);
    let next = first.start + first.length + spacing;
    for (const item of middle) {
      move(item, next);
      next += item.length + spacing;
    }
  } else {
    const firstEdge = Math.min(...items.map(item => item.start));
    const lastEdge = Math.max(...items.map(item => item.start + item.length));
    for (const item of items) {
      if (action === 'left' || action === 'top') move(item, firstEdge);
      else if (action === 'right' || action === 'bottom') move(item, lastEdge - item.length);
      else move(item, (firstEdge + lastEdge - item.length) / 2);
    }
  }
  if (!changes.size) return nodes;
  return nodes.map(node => {
    const coordinate = changes.get(node.id);
    return coordinate === undefined ? node : { ...node, position: { ...node.position, [axis]: coordinate } };
  });
}

export function isArrangeShortcut(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey' | 'repeat' | 'isComposing' | 'defaultPrevented'>) {
  return event.key.toLowerCase() === 'l' && event.shiftKey && !event.metaKey && !event.ctrlKey
    && !event.altKey && !event.repeat && !event.isComposing && !event.defaultPrevented;
}

export function arrangeSelectedNodes<T extends LayoutNode>(nodes: T[], edges: LayoutLink[], gridOrigin?: number): T[] {
  if (nodes.some(node => node.dragging)) return nodes;
  const selected = selectedLayoutNodes(nodes);
  if (selected.length < 2) return nodes;
  const moving = new Set(selected.map(node => node.id));
  const links = edges.filter(edge => edge.source !== edge.target && moving.has(edge.source) && moving.has(edge.target));
  const ordered = [...selected].sort((a, b) => a.id.localeCompare(b.id));
  const step = (value: number) => gridOrigin === undefined ? value : Math.ceil(value / canvasGridGap) * canvasGridGap;
  const snap = (value: number) => gridOrigin === undefined ? value : gridOrigin + Math.round((value - gridOrigin) / canvasGridGap) * canvasGridGap;
  const positions = new Map<string, XYPosition>();
  const adjacency = new Map(ordered.map(node => [node.id, new Set<string>()]));
  for (const edge of links) {
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  const unseen = new Set(ordered.map(node => node.id));
  const groups: T[][] = [];
  for (const node of ordered) {
    if (!unseen.delete(node.id)) continue;
    const members = new Set([node.id]);
    for (const id of members) for (const neighbor of adjacency.get(id)!) {
      if (unseen.delete(neighbor)) members.add(neighbor);
    }
    if (members.size > 1) groups.push(ordered.filter(item => members.has(item.id)));
  }
  type Rect = { left: number; top: number; right: number; bottom: number };
  const rectangle = (node: T, position = topLeft(node)): Rect => ({
    left: position.x, top: position.y, right: position.x + size(node).width, bottom: position.y + size(node).height,
  });
  const obstacles: Rect[] = nodes.filter(node => !moving.has(node.id) && !node.hidden && !node.parentId).map(node => rectangle(node));
  const overlaps = (a: Rect, b: Rect) => a.left < b.right + gap && a.right + gap > b.left
    && a.top < b.bottom + gap && a.bottom + gap > b.top;
  let connectedBottom = -Infinity;
  for (const group of groups) {
    const memberIds = new Set(group.map(node => node.id));
    const groupLinks = links.filter(edge => memberIds.has(edge.source));
    const corners = group.map(topLeft);
    const origin = { x: snap(Math.min(...corners.map(point => point.x))), y: snap(Math.min(...corners.map(point => point.y))) };
    const ranks = new Map(group.map(node => [node.id, 0]));
    const remaining = new Set(memberIds);
    // Stable cycle breaking keeps cyclic workflows finite and repeatable.
    while (remaining.size) {
      const ready = group.filter(node => remaining.has(node.id) && !groupLinks.some(edge => edge.target === node.id && remaining.has(edge.source)));
      const batch = ready.length ? ready : group.filter(node => remaining.has(node.id)).slice(0, 1);
      for (const node of batch) {
        remaining.delete(node.id);
        for (const edge of groupLinks.filter(edge => edge.source === node.id && remaining.has(edge.target))) {
          ranks.set(edge.target, Math.max(ranks.get(edge.target)!, ranks.get(node.id)! + 1));
        }
      }
    }
    let x = origin.x;
    for (let rank = 0; rank <= Math.max(...ranks.values()); rank++) {
      const column = group.filter(node => ranks.get(node.id) === rank);
      let y = origin.y;
      for (const node of column) {
        positions.set(node.id, { x, y });
        y += step(size(node).height + gap);
      }
      x += step(Math.max(0, ...column.map(node => size(node).width)) + gap);
    }
    const rects = group.map(node => rectangle(node, positions.get(node.id)!));
    const bounds: Rect = { left: origin.x, top: origin.y,
      right: Math.max(...rects.map(rect => rect.right)), bottom: Math.max(...rects.map(rect => rect.bottom)) };
    const translated = (dx: number, dy: number): Rect => ({ left: bounds.left + dx, right: bounds.right + dx, top: bounds.top + dy, bottom: bounds.bottom + dy });
    let offset = { x: 0, y: 0 };
    if (obstacles.some(obstacle => overlaps(bounds, obstacle))) {
      // The nearest free translation lies on a rectangle boundary (or an intersection).
      // Consider both axes instead of always pushing a workflow far to the right.
      const outward = (value: number) => Math.sign(value) * step(Math.abs(value));
      const xs = new Set([0, ...obstacles.flatMap(rect => [outward(rect.right + gap - bounds.left), outward(rect.left - gap - bounds.right)])]);
      const ys = new Set([0, ...obstacles.flatMap(rect => [outward(rect.bottom + gap - bounds.top), outward(rect.top - gap - bounds.bottom)])]);
      let bestDistance = Infinity;
      for (const dx of xs) for (const dy of ys) {
        const distance = dx * dx + dy * dy;
        if (distance >= bestDistance || obstacles.some(obstacle => overlaps(translated(dx, dy), obstacle))) continue;
        bestDistance = distance;
        offset = { x: dx, y: dy };
      }
    }
    for (const node of group) {
      const position = positions.get(node.id)!;
      position.x += offset.x; position.y += offset.y;
    }
    obstacles.push(translated(offset.x, offset.y));
    connectedBottom = Math.max(connectedBottom, bounds.bottom + offset.y);
  }

  const isolated = selected.filter(node => adjacency.get(node.id)?.size === 0).map(node => ({
    id: node.id, corner: topLeft(node), ...size(node),
  })).sort((a, b) => a.corner.y - b.corner.y || a.corner.x - b.corner.x || a.id.localeCompare(b.id));
  if (isolated.length) {
    const corners = selected.map(node => positions.get(node.id) ?? topLeft(node));
    const left = snap(Math.min(...corners.map(corner => corner.x)));
    const top = snap(groups.length ? connectedBottom + gap : Math.min(...corners.map(corner => corner.y)));
    const columns = Math.ceil(Math.sqrt(isolated.length));
    const columnWidths = Array<number>(columns).fill(0);
    const rowHeights = Array<number>(Math.ceil(isolated.length / columns)).fill(0);
    isolated.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      columnWidths[column] = Math.max(columnWidths[column], node.width);
      rowHeights[row] = Math.max(rowHeights[row], node.height);
    });
    const cumulative = (sizes: number[], origin: number) => sizes.map(size => {
      const offset = origin;
      origin += step(size + gap);
      return offset;
    });
    const columnX = cumulative(columnWidths, left);
    const rowY = cumulative(rowHeights, top);
    isolated.forEach((node, index) => {
      const column = index % columns;
      positions.set(node.id, {
        x: snap(columnX[column] + (columnWidths[column] - node.width) / 2),
        y: rowY[Math.floor(index / columns)],
      });
    });
  }
  let changed = false;
  const result = nodes.map(node => {
    const corner = positions.get(node.id);
    if (!corner) return node;
    const offset = anchorOffset(node);
    const position = { x: corner.x + offset.x, y: corner.y + offset.y };
    if (position.x === node.position.x && position.y === node.position.y) return node;
    changed = true;
    return { ...node, position };
  });
  return changed ? result : nodes;
}
