import type { Edge } from '@xyflow/react';
import { isCanvasImageNode, isCanvasTextNode, type AppNode, type CanvasRouter } from './types.ts';

export const defaultRouterLabel = '路由';

// Older canvases stored the generated English name in the editable label.
export function routerLabel(data: CanvasRouter['data']) {
  return data.labelEdited ? data.label : data.label.replace(/^Router( [1-9]\d*)?$/, defaultRouterLabel + '$1');
}

export const routerSize = { width: 192, height: 49 };
export const relayHandles = ['result', 'text', 'video', 'audio'] as const;
export type RelayHandle = typeof relayHandles[number];

export function canvasOutputHandle(node?: AppNode): RelayHandle | undefined {
  if (node && isCanvasImageNode(node)) return 'result';
  if (node && isCanvasTextNode(node)) return 'text';
  if (node?.type === 'video' || node?.type === 'audio') return node.type;
}

export function expectedSourceHandle(input?: string | null): RelayHandle | undefined {
  if (input === 'text' || input === 'prompt') return 'text';
  if (input?.startsWith('image-') || input === 'first-frame' || input === 'last-frame') return 'result';
  if (input?.startsWith('video-')) return 'video';
  if (input?.startsWith('audio-')) return 'audio';
}

// A disconnected relay can already have consumers. Every branch of a connected
// relay network must agree on the type when a source or consumer is attached.
export function routerTypes(id: string, edges: Edge[]) {
  const types = new Set<string>();
  const seen = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.target === current && edge.targetHandle === 'in') {
        if (edge.sourceHandle === 'out') pending.push(edge.source);
        else if (edge.sourceHandle) types.add(edge.sourceHandle);
      }
      if (edge.source === current && edge.sourceHandle === 'out') {
        if (edge.targetHandle === 'in') pending.push(edge.target);
        else {
          const type = expectedSourceHandle(edge.targetHandle);
          if (type) types.add(type);
        }
      }
    }
  }
  return types;
}

const cache = new WeakMap<Edge[], Edge[]>();

/** Read inputs through relay chains. Keep the consumer's wire ID and slot for
 * thumbnail removal and ordering. Only the physical edges are ever persisted. */
export function routedEdges(edges: Edge[]): Edge[] {
  const cached = cache.get(edges);
  if (cached) return cached;
  const inputs = new Map(edges.filter(edge => edge.targetHandle === 'in').map(edge => [edge.target, edge]));
  const result = !inputs.size ? edges : edges.map(edge => {
    if (edge.sourceHandle !== 'out') return edge;
    const seen = new Set<string>();
    let origin = edge;
    while (origin.sourceHandle === 'out') {
      const input = inputs.get(origin.source);
      if (!input || seen.has(origin.source)) return edge;
      seen.add(origin.source);
      origin = input;
    }
    return { ...edge, source: origin.source, sourceHandle: origin.sourceHandle };
  });
  cache.set(edges, result);
  return result;
}
