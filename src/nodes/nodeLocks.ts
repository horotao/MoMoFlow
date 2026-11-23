import { isCanvasGroup, isNodeLocked, type AppNode } from './types.ts';

const isSelected = (node: AppNode) => node.selected && !node.hidden && !isCanvasGroup(node);

export function selectionLockState(nodes: AppNode[]) {
  const selected = nodes.filter(isSelected);
  return { count: selected.length, allLocked: selected.length > 0 && selected.every(isNodeLocked) };
}

export function toggleSelectionLock(nodes: AppNode[]): AppNode[] {
  const { count, allLocked } = selectionLockState(nodes);
  if (count < 2) return nodes;
  const locked = !allLocked;
  return nodes.map(node => isSelected(node) && isNodeLocked(node) !== locked
    ? ({ ...node, data: { ...node.data, locked } } as AppNode)
    : node);
}
