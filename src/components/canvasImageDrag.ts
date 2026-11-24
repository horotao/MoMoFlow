import type { DragEvent } from 'react';
import type { Node } from '@xyflow/react';

/** Composer Image nodes can move from the result without changing lock/tool flags. */
export function withCanvasImageDrag<T extends Node>(node: T): T & { dragHandle?: string } {
  return node.data.composer || node.data.textComposer || node.data.videoComposer ? {
    ...node,
    dragHandle: '.image-node-heading, .image-node-toolbar-bridge, .image-node-result',
  } : node;
}

/** Keep native image dragging out of both result layers and history buttons. */
export function preventCanvasImageDrag(event: DragEvent<HTMLDivElement>) {
  if (event.target instanceof Element && event.target.closest('.image-node-result, .image-node-variants')) {
    event.preventDefault();
  }
}
