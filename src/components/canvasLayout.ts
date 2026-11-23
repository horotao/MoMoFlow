import type { Edge, Node, XYPosition } from '@xyflow/react';
import { canvasGridGap } from './canvasGrid.ts';

type LayoutNode = Node;
type LayoutLink = Pick<Edge, 'source' | 'target'>;
const gap = 64;
const size = (node: LayoutNode) => ({
  width: node.measured?.width ?? node.width ?? 288,
  height: node.measured?.height ?? node.height ?? 240,
});

export function isArrangeShortcut(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey' | 'repeat' | 'isComposing' | 'defaultPrevented'>) {
  return event.key.toLowerCase() === 'l' && event.shiftKey && !event.metaKey && !event.ctrlKey
    && !event.altKey && !event.repeat && !event.isComposing && !event.defaultPrevented;
}

function layoutSelection<T extends LayoutNode>(nodes: T[], edges: LayoutLink[]) {
  // Nested nodes keep their parent-relative coordinate system untouched.
  const selected = nodes.filter(node => node.selected && !node.data.locked && !node.hidden && !node.parentId);
  const ids = new Set(selected.map(node => node.id));
  const links = selected.length < 2 || nodes.some(node => node.dragging)
    ? []
    : edges.filter(edge => edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target));
  return { selected, links };
}

export function canArrangeSelectedNodes(nodes: LayoutNode[], edges: LayoutLink[]) {
  return layoutSelection(nodes, edges).links.length > 0;
}

export function arrangeSelectedNodes<T extends LayoutNode>(nodes: T[], edges: LayoutLink[], gridOrigin?: number): T[] {
  const { selected, links } = layoutSelection(nodes, edges);
  if (!links.length) return nodes;
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
    // Individually isolated nodes are fixed, including their fractional coordinates.
    if (members.size > 1) groups.push(ordered.filter(item => members.has(item.id)));
  }
  const moving = new Set(groups.flatMap(group => group.map(node => node.id)));
  type Rect = { left: number; top: number; right: number; bottom: number };
  const anchorOffset = (node: T) => {
    const { width, height } = size(node);
    const [x, y] = node.origin ?? [0, 0];
    return { x: width * x, y: height * y };
  };
  const topLeft = (node: T) => {
    const offset = anchorOffset(node);
    return { x: node.position.x - offset.x, y: node.position.y - offset.y };
  };
  const rectangle = (node: T, position = topLeft(node)): Rect => ({
    left: position.x, top: position.y, right: position.x + size(node).width, bottom: position.y + size(node).height,
  });
  const obstacles: Rect[] = nodes.filter(node => !moving.has(node.id) && !node.hidden && !node.parentId).map(node => rectangle(node));
  const overlaps = (a: Rect, b: Rect) => a.left < b.right + gap && a.right + gap > b.left
    && a.top < b.bottom + gap && a.bottom + gap > b.top;
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
