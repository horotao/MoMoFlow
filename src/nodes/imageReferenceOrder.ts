import type { Edge } from '@xyflow/react';
import { imageInputHandles, isImageInputHandle } from './connectionRules.ts';

/** Reuse the occupied slots so thumbnails, auto ratio and model inputs share one order. */
export function reorderImageReferences(edges: Edge[], target: string, order: readonly string[]): Edge[] {
  const references = edges.filter(edge => edge.target === target && isImageInputHandle(edge.targetHandle))
    .sort((a, b) => imageInputHandles.indexOf(a.targetHandle!) - imageInputHandles.indexOf(b.targetHandle!));
  const ids = new Set(references.map(edge => edge.id));
  // A connection may have changed while the user was dragging. Never drop or duplicate it.
  if (order.length !== references.length || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) return edges;
  const slots = new Map(order.map((id, index) => [id, references[index].targetHandle]));
  if (references.every(edge => slots.get(edge.id) === edge.targetHandle)) return edges;
  return edges.map(edge => ids.has(edge.id) ? { ...edge, targetHandle: slots.get(edge.id) } : edge);
}
