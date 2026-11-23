import type { Edge, XYPosition } from '@xyflow/react';
import { alignSelectedNodes, arrangeSelectedNodes, type CanvasAlignment } from '../components/canvasLayout.ts';
import { canvasImageBaseSize } from './canvasImageGeometry.ts';
import { isCanvasGroup, isNodeLocked, type AppNode, type CanvasGroup } from './types.ts';

const padding = 64;
type Box = XYPosition & { right: number; bottom: number };

function nodeBox(node: AppNode, position = node.position): Box {
  const size = isCanvasGroup(node) ? node : node.measured;
  const width = size?.width ?? node.measured?.width ?? node.width ?? canvasImageBaseSize;
  const height = size?.height ?? node.measured?.height ?? node.height ?? canvasImageBaseSize;
  const x = position.x - width * (node.origin?.[0] ?? 0);
  const y = position.y - height * (node.origin?.[1] ?? 0);
  return { x, y, right: x + width, bottom: y + height };
}

function frameFor(nodes: AppNode[]) {
  const boxes = nodes.map(node => nodeBox(node));
  const x = Math.min(...boxes.map(box => box.x)) - padding;
  const y = Math.min(...boxes.map(box => box.y)) - padding;
  return {
    position: { x, y },
    width: Math.max(...boxes.map(box => box.right)) + padding - x,
    height: Math.max(...boxes.map(box => box.bottom)) + padding - y,
  };
}

export function canGroupSelection(nodes: AppNode[]) {
  const selected = nodes.filter(node => node.selected && !node.hidden);
  return selected.length >= 2 && selected.every(node => !isCanvasGroup(node) && !node.parentId)
    && !nodes.some(node => node.dragging);
}

function shifted(point: XYPosition, offset: XYPosition, direction: 1 | -1) {
  return { x: point.x + offset.x * direction, y: point.y + offset.y * direction };
}

export function settleGroupDrop(nodes: AppNode[], draggedIds: string[]): AppNode[] {
  const dragged = new Set(draggedIds);
  const groups = nodes.filter(isCanvasGroup);
  const frames = groups.filter(group => !group.hidden && !isNodeLocked(group) && !dragged.has(group.id))
    .map(group => ({ id: group.id, ...nodeBox(group) })).reverse();
  if (!frames.length) return nodes;

  const byId = new Map(groups.map(group => [group.id, group]));
  const framesById = new Map(frames.map(frame => [frame.id, frame]));
  const nextParents = new Map<string, string | undefined>();
  const expanded = new Map<string, Box>();
  const expand = (frame: typeof frames[number], box: Box) => {
    const bounds = expanded.get(frame.id) ?? frame;
    const x = box.x < frame.x ? Math.min(bounds.x, box.x - padding) : bounds.x;
    const y = box.y < frame.y ? Math.min(bounds.y, box.y - padding) : bounds.y;
    const right = box.right > frame.right ? Math.max(bounds.right, box.right + padding) : bounds.right;
    const bottom = box.bottom > frame.bottom ? Math.max(bounds.bottom, box.bottom + padding) : bounds.bottom;
    if (x !== bounds.x || y !== bounds.y || right !== bounds.right || bottom !== bounds.bottom) {
      expanded.set(frame.id, { x, y, right, bottom });
    }
  };

  // Resolve all drops against the original frames before growing any of them.
  for (const node of nodes) {
    if (!dragged.has(node.id) || isCanvasGroup(node) || isNodeLocked(node) || node.hidden) continue;
    const oldParent = node.parentId ? byId.get(node.parentId) : undefined;
    const old = oldParent && framesById.get(oldParent.id);
    if (node.parentId && !old) continue;
    const box = nodeBox(node, oldParent ? shifted(node.position, oldParent.position, 1) : node.position);
    const cx = (box.x + box.right) / 2;
    const cy = (box.y + box.bottom) / 2;
    const containsCenter = (frame: typeof frames[number]) =>
      frame.x <= cx && cx <= frame.right && frame.y <= cy && cy <= frame.bottom;
    const stillOverlaps = old && box.x < old.right && box.right > old.x && box.y < old.bottom && box.bottom > old.y;
    const target = old && containsCenter(old) ? old : frames.find(containsCenter) ?? (stillOverlaps ? old : undefined);

    if (stillOverlaps) expand(old, box);
    if (target && target !== old) expand(target, box);
    if (target?.id !== node.parentId) nextParents.set(node.id, target?.id);
  }
  if (!expanded.size && !nextParents.size) return nodes;

  return nodes.map(node => {
    if (isCanvasGroup(node)) {
      const box = expanded.get(node.id);
      if (!box) return node;
      const size = { width: box.right - box.x, height: box.bottom - box.y };
      return { ...node, ...size, measured: size, position: { x: box.x, y: box.y } };
    }
    const oldParent = node.parentId ? byId.get(node.parentId) : undefined;
    const parentId = nextParents.has(node.id) ? nextParents.get(node.id) : node.parentId;
    const newParent = parentId ? byId.get(parentId) : undefined;
    const changedFrame = parentId ? expanded.get(parentId) : undefined;
    const offset = changedFrame ?? newParent?.position;
    if (parentId === node.parentId && (!changedFrame || (offset?.x === oldParent?.position.x && offset?.y === oldParent?.position.y))) return node;
    const absolute = oldParent ? shifted(node.position, oldParent.position, 1) : node.position;
    return { ...node, parentId, position: offset ? shifted(absolute, offset, -1) : absolute };
  });
}

export function groupSelectedNodes(nodes: AppNode[], id: string): AppNode[] {
  if (!canGroupSelection(nodes)) return nodes;
  const members = nodes.filter(node => node.selected && !node.hidden);
  const ids = new Set(members.map(node => node.id));
  const names = new Set(nodes.filter(isCanvasGroup).map(node => node.data.label));
  let label = 'Field';
  for (let i = 1; names.has(label); i++) label = `Field ${i}`;
  const frame = frameFor(members);
  const group: CanvasGroup = { id, type: 'canvas-group', ...frame, zIndex: -1, data: { label } };
  return [group, ...nodes.map(node => ids.has(node.id)
    ? { ...node, position: shifted(node.position, frame.position, -1), parentId: id, selected: false }
    : node.selected ? { ...node, selected: false } : node)];
}

export function ungroupNodes(nodes: AppNode[], id: string): AppNode[] {
  const group = nodes.find(node => node.id === id);
  if (!isCanvasGroup(group)) return nodes;
  return nodes.filter(node => node.id !== id).map(node => node.parentId === id
    ? { ...node, parentId: undefined, position: shifted(node.position, group.position, 1), selected: false }
    : node);
}

export function arrangeGroup(nodes: AppNode[], edges: Edge[], groupId: string, action?: CanvasAlignment) {
  const group = nodes.find(node => node.id === groupId);
  if (!isCanvasGroup(group) || isNodeLocked(group)) return nodes;
  const members = nodes.filter(node => node.parentId === groupId).map(node => ({
    ...node, parentId: undefined, selected: true, position: shifted(node.position, group.position, 1),
  }));
  const layout = action ? alignSelectedNodes(members, action) : arrangeSelectedNodes(members, edges);
  if (layout === members) return nodes;
  const frame = frameFor(layout);
  const positioned = new Map(layout.map(node => [node.id, shifted(node.position, frame.position, -1)]));
  return nodes.map(node => {
    if (isCanvasGroup(node) && node.id === groupId) return { ...node, ...frame };
    const position = positioned.get(node.id);
    return position ? { ...node, position } : node;
  });
}
