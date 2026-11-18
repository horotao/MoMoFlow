import type { Node, NodeChange, NodePositionChange, XYPosition } from '@xyflow/react';

export const canvasGridGap = 32;
export const canvasGridDotSize = 1;
export const canvasGridOrigin = canvasGridDotSize / 2;
// React Flow's SVG pattern is translated by half a cell.
export const canvasSvgGridOrigin = canvasGridOrigin - canvasGridGap / 2;

const gridSnapStorageKey = 'momoflow-grid-snap';

export function readGridSnap(storage?: Pick<Storage, 'getItem'>) {
  try { return (storage ?? globalThis.localStorage)?.getItem(gridSnapStorageKey) === 'true'; }
  catch { return false; }
}

export function saveGridSnap(enabled: boolean, storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? globalThis.localStorage)?.setItem(gridSnapStorageKey, String(enabled)); }
  catch { /* The current canvas can still use the preference. */ }
}

export type GridDragAnchor = { id: string; offset: XYPosition };

type DragPosition = NodePositionChange & { position: XYPosition; dragging: boolean };

function isDragPosition<T extends Node>(change: NodeChange<T>): change is DragPosition {
  return change.type === 'position' && change.position !== undefined && change.dragging !== undefined;
}

export function snapDragChanges<T extends Node>(changes: NodeChange<T>[], anchor: GridDragAnchor, origin: number): NodeChange<T>[] {
  const reference = changes.find((change): change is DragPosition => isDragPosition(change) && change.id === anchor.id);
  if (!reference) return changes;

  const snap = (value: number) => origin + Math.round((value - origin) / canvasGridGap) * canvasGridGap;
  const x = reference.position.x + anchor.offset.x;
  const y = reference.position.y + anchor.offset.y;
  const dx = snap(x) - x;
  const dy = snap(y) - y;
  if (dx === 0 && dy === 0) return changes;

  // Use the same translation for the whole drag so fractional spacing is preserved.
  return changes.map(change => isDragPosition(change) && change.dragging === reference.dragging
    ? { ...change, position: { x: change.position.x + dx, y: change.position.y + dy } }
    : change);
}
