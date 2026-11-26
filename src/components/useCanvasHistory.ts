import { nodeColorTags } from '../nodes/colorTags';
import { isFileNode } from '../nodes/types';
import { isSeedreamNode } from '../nodes/types';
import { isSeedreamExactSize } from '../nodes/seedream';
import { createContext } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { initialTextDocument } from '../nodes/textDocument';
import { isTextNode, textInputHandles } from '../nodes/textVariables';
import { assetResources, nodeAssetUrls } from '../nodes/assetResources';
import { isCanvasAudio, isCanvasGroup, isCanvasVideo, isCanvasImageNode, isCanvasTextNode, isNodeLocked, type AppNode } from '../nodes/types';

export const CanvasHistoryContext = createContext({ canUndo: false, canRedo: false, undo: () => {}, redo: () => {}, endEditGroup: () => {} });

type Snapshot = { nodes: AppNode[]; edges: Edge[] };

// Selection, measured geometry and viewport changes are not document edits.
function snapshot(nodes: AppNode[], edges: Edge[]): Snapshot {
  return { nodes: nodes.map((node) => isTextNode(node) ? {
    ...node, data: { ...node.data, content: node.data.content ?? initialTextDocument(node.data.text,
      textInputHandles(node.id, edges), node.id) },
  } : node), edges };
}

function signature({ nodes, edges }: Snapshot) {
  return JSON.stringify({
    nodes: nodes.map(node => ({ id: node.id, type: node.type, position: node.position,
      // A player can discover these after the result is committed or after a preview retry.
      data: isCanvasVideo(node) && node.data.asset ? { ...node.data,
        asset: { ...node.data.asset, width: undefined, height: undefined, duration: undefined } } : node.data,
      parentId: node.parentId, ...(isCanvasGroup(node) ? { width: node.width, height: node.height } : {}) })),
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
    if (nodes.some(node => node.dragging || isCanvasGroup(node) && node.resizing)) return;
    const next = snapshot(nodes, edges);
    const state = history.current;
    if (signature(next) === signature(state.present)) { state.present = next; return; }
    // Coalesce consecutive editor updates, but keep graph edits separate.
    const dataOnly = nodes.length === state.present.nodes.length
      && nodes.every((node, i) => node.id === state.present.nodes[i].id
        && node.parentId === state.present.nodes[i].parentId
        && (!isCanvasGroup(node) || node.width === state.present.nodes[i].width && node.height === state.present.nodes[i].height)
        && JSON.stringify(node.position) === JSON.stringify(state.present.nodes[i].position))
      && JSON.stringify(edges) === JSON.stringify(state.present.edges);
    const annotationsChanged = nodes.some(node => {
      if (!isFileNode(node)) return false;
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isFileNode(previous) && node.data.annotations !== previous.data.annotations;
    });
    const seedreamSizeChanged = nodes.some(node => isSeedreamNode(node) && isSeedreamExactSize(node.data.size) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return previous && isSeedreamNode(previous) && node.data.size !== previous.data.size;
    })());
    const mentionIds = (node: AppNode | undefined) => node && (isCanvasTextNode(node) ? node.data.textComposer.mentions
      : isCanvasImageNode(node) ? node.data.composer.mentions : isCanvasVideo(node) ? node.data.videoComposer?.mentions : undefined)?.map(item => item.nodeId).join('\n');
    const mentionsChanged = nodes.some(node => mentionIds(node) !== mentionIds(state.present.nodes.find(item => item.id === node.id)));
    const colorTagsChanged = nodes.some(node => JSON.stringify(nodeColorTags(node)) !== JSON.stringify(nodeColorTags(state.present.nodes.find(item => item.id === node.id))));
    const labelChanged = nodes.some(node => node.data.label !== state.present.nodes.find(item => item.id === node.id)?.data.label);
    const mediaResultChanged = dataOnly && nodes.some((node, index) => {
      const previous = state.present.nodes[index];
      if (isCanvasAudio(node) && isCanvasAudio(previous)) return node.data.activeAudioId !== previous.data.activeAudioId;
      return isCanvasVideo(node) && isCanvasVideo(previous) && node.data.asset?.id !== previous.data.asset?.id;
    });
    const cropsChanged = nodes.some(node => {
      if (!isCanvasImageNode(node)) return false;
      const previous = state.present.nodes.find(item => item.id === node.id);
      return previous && isCanvasImageNode(previous) && (node.data.results ?? []).some(asset => {
        const old = previous.data.results?.find(item => item.id === asset.id);
        return Boolean(asset.crop || old?.crop) && asset.url !== old?.url;
      });
    });
    const lockChanged = dataOnly && nodes.some((node, i) => isNodeLocked(node) !== isNodeLocked(state.present.nodes[i]));
    const groupColorChanged = dataOnly && nodes.some((node, i) => {
      const previous = state.present.nodes[i];
      return isCanvasGroup(node) && isCanvasGroup(previous) && node.data.color !== previous.data.color;
    });
    if (mediaResultChanged || cropsChanged || colorTagsChanged || mentionsChanged || labelChanged || lockChanged || groupColorChanged || annotationsChanged || seedreamSizeChanged || !dataOnly || Date.now() - state.time > 750) {
      state.past = [...state.past.slice(-99), state.present];
    }
    state.present = next;
    state.future = [];
    state.time = dataOnly && !mediaResultChanged && !cropsChanged && !colorTagsChanged && !labelChanged && !mentionsChanged && !lockChanged && !groupColorChanged ? Date.now() : 0;
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

  const endEditGroup = useCallback(() => { history.current.time = 0; }, []);
  return useMemo(() => ({ ...availability, undo: () => travel('past'), redo: () => travel('future'), endEditGroup }),
    [availability, travel, endEditGroup]);
}
