import type { Edge, NodeChange } from '@xyflow/react';
import { isCanvasGroup, isCanvasImageNode, isCanvasTextNode, isCanvasVideo, isNodeLocked, type AppNode } from './types.ts';

/** Clone the dragged subgraph; asset URLs remain shared under the existing asset owners. */
export function duplicateNodes(nodes: AppNode[], edges: Edge[], draggedIds: string[], newId: () => string = () => crypto.randomUUID()) {
  const roots = new Set(draggedIds.filter(id => {
    const node = nodes.find(item => item.id === id);
    return node && !node.hidden && !isNodeLocked(node) && node.draggable !== false
      && !(isCanvasGroup(node) && nodes.some(item => item.parentId === id && isNodeLocked(item)));
  }));
  const included = new Set(roots);
  // Include group members even when React Flow only reports the frame as dragged.
  for (let previous = -1; previous !== included.size;) {
    previous = included.size;
    for (const node of nodes) if (node.parentId && included.has(node.parentId)) included.add(node.id);
  }
  const ids = new Map(nodes.filter(node => included.has(node.id)).map(node => [node.id, newId()]));
  const copies = nodes.filter(node => ids.has(node.id)).map(node => {
    const data = structuredClone(node.data);
    const copy = { ...node, id: ids.get(node.id)!, data, position: { ...node.position },
      parentId: node.parentId ? ids.get(node.parentId) ?? node.parentId : undefined,
      selected: roots.has(node.id), dragging: roots.has(node.id), resizing: false } as AppNode;
    const composer = isCanvasTextNode(copy) ? copy.data.textComposer : isCanvasImageNode(copy) ? copy.data.composer
      : isCanvasVideo(copy) ? copy.data.videoComposer : undefined;
    if (composer?.mentions) {
      // Uncopied references become ordinary prompt text, with no dangling capsules.
      composer.mentions = composer.mentions.flatMap(mention => {
        const nodeId = ids.get(mention.nodeId);
        return nodeId ? [{ ...mention, nodeId }] : [];
      });
    }
    return copy;
  });
  const connections = edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({
    ...edge, id: newId(), source: ids.get(edge.source)!, target: ids.get(edge.target)!,
    data: edge.data ? structuredClone(edge.data) : undefined, selected: false,
  }));
  return { ids, nodes: copies, edges: connections };
}

/** Keep React Flow's original drag anchor, but apply its position updates to the copies. */
export function duplicateDragChanges(changes: NodeChange<AppNode>[], ids: Map<string, string>): NodeChange<AppNode>[] {
  return changes.map(change => change.type === 'position' && ids.has(change.id)
    ? { ...change, id: ids.get(change.id)! } : change);
}
