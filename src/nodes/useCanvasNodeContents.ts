import { useStore, type ReactFlowState } from '@xyflow/react';
import type { AppNode } from './types';

const selectNodes = (state: ReactFlowState) => state.nodes as AppNode[];
const sameContentsAs = new WeakMap<AppNode[], AppNode[]>();

// All prompt editors see the same immutable nodes array. Share the comparison on each drag update.
function sameNodeContents(previous: AppNode[], next: AppNode[]) {
  if (previous === next || sameContentsAs.get(next) === previous) return true;
  const same = previous.length === next.length && previous.every((node, index) =>
    node.id === next[index].id && node.type === next[index].type && node.data === next[index].data);
  if (same) sameContentsAs.set(next, previous);
  return same;
}

// Only id, type, order and data are current in this view. Geometry comes from React Flow.
export function useCanvasNodeContents() {
  return useStore(selectNodes, sameNodeContents);
}
