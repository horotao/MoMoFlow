import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { initialTextDocument } from '../nodes/textDocument';
import { isTextNode, variableHandleId, variableIndex } from '../nodes/textVariables';
import { assetResources, nodeAssetUrls } from '../nodes/assetResources';
import type { AppNode } from '../nodes/types';

type Snapshot = { nodes: AppNode[]; edges: Edge[] };

// Selection, measured geometry and viewport changes are not document edits.
function snapshot(nodes: AppNode[], edges: Edge[]): Snapshot {
  return { nodes: nodes.map((node) => isTextNode(node) ? {
    ...node, data: { ...node.data, content: node.data.content ?? initialTextDocument(node.data.text,
      edges.filter((edge) => edge.target === node.id).map((edge) => variableHandleId(variableIndex(edge.targetHandle))), node.id) },
  } : node), edges };
}

function signature({ nodes, edges }: Snapshot) {
  return JSON.stringify({
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map((edge) => ({ ...edge, selected: undefined })),
  }, (key, value) => key === 'content' && Array.isArray(value) && value.length === 0 ? undefined : value);
}

export function useCanvasHistory(nodes: AppNode[], edges: Edge[], restore: (value: Snapshot) => void) {
  const assetOwner = useRef(Symbol('canvas history'));
  const history = useRef({ past: [] as Snapshot[], present: snapshot(nodes, edges), future: [] as Snapshot[], time: 0 });
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });
  const sync = useCallback(() => setAvailability({
    canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0,
  }), []);

  useLayoutEffect(() => {
    if (nodes.some((node) => node.dragging)) return;
    const next = snapshot(nodes, edges);
    const state = history.current;
    if (signature(next) === signature(state.present)) return;
    // Coalesce consecutive editor updates, but keep graph edits separate.
    const dataOnly = nodes.length === state.present.nodes.length
      && nodes.every((node, i) => node.id === state.present.nodes[i].id
        && JSON.stringify(node.position) === JSON.stringify(state.present.nodes[i].position))
      && JSON.stringify(edges) === JSON.stringify(state.present.edges);
    if (!dataOnly || Date.now() - state.time > 750) {
      state.past = [...state.past.slice(-99), state.present];
    }
    state.present = next;
    state.future = [];
    state.time = dataOnly ? Date.now() : 0;
    sync();
  }, [nodes, edges, sync]);

  useLayoutEffect(() => {
    const state = history.current;
    function* retainedNodes() {
      yield* nodes;
      yield* state.present.nodes;
      for (const item of state.past) yield* item.nodes;
      for (const item of state.future) yield* item.nodes;
    }
    assetResources.adopt(assetOwner.current, nodeAssetUrls(retainedNodes()));
  }, [nodes, edges, availability]);
  useLayoutEffect(() => {
    const owner = assetOwner.current;
    return () => assetResources.release(owner);
  }, []);

  const travel = useCallback((direction: 'past' | 'future') => {
    const state = history.current;
    const target = state[direction].pop();
    if (!target) return;
    state[direction === 'past' ? 'future' : 'past'].push(state.present);
    state.present = target;
    state.time = 0;
    restore({
      nodes: target.nodes.map((node) => ({ ...node, dragging: false })),
      edges: target.edges,
    });
    sync();
  }, [restore, sync]);

  return { ...availability, undo: () => travel('past'), redo: () => travel('future') };
}
