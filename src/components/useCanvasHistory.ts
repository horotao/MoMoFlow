import { masksDocument } from '../nodes/masksExtractor';
import { isImageIteratorNode, isTextIteratorNode, isMasksExtractorNode } from '../nodes/types';
import { blendDocument } from '../nodes/blend';
import { isBlendNode } from '../nodes/types';
import { resizeDocument } from '../nodes/resize';
import { isResizeNode } from '../nodes/types';
import { paletteDocument } from '../nodes/colorPalette';
import { isColorPaletteNode } from '../nodes/types';
import { createContext } from 'react';
import { compositorDocument } from '../nodes/compositor';
import { isCompositorNode } from '../nodes/types';
import { rotateFlipDocument } from '../nodes/rotateFlip';
import { isRotateFlipNode } from '../nodes/types';
import { invertDocument } from '../nodes/invert';
import { isInvertNode } from '../nodes/types';
import { levelsDocument } from '../nodes/levels';
import { isLevelsNode } from '../nodes/types';
import { matteGrowShrinkDocument } from '../nodes/matteGrowShrink';
import { isMatteGrowShrinkNode } from '../nodes/types';
import { blurDocument } from '../nodes/blur';
import { isBlurNode } from '../nodes/types';
import { colorDocument } from '../nodes/colorCorrection';
import { cropDocument } from '../nodes/crop';
import { isColorCorrectionNode, isCropNode, isPainterNode } from '../nodes/types';
import { painterDocument } from '../nodes/painter';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { initialTextDocument } from '../nodes/textDocument';
import { isTextNode, variableHandleId, variableIndex } from '../nodes/textVariables';
import { assetResources, nodeAssetUrls } from '../nodes/assetResources';
import type { AppNode } from '../nodes/types';

export const CanvasHistoryContext = createContext({ canUndo: false, canRedo: false, undo: () => {}, redo: () => {} });

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
    nodes: nodes.map(node => ({ id: node.id, type: node.type, position: node.position, data: isMasksExtractorNode(node) ? masksDocument(node.data) : isBlendNode(node) ? blendDocument(node.data) : isResizeNode(node) ? resizeDocument(node.data) : isColorPaletteNode(node) ? paletteDocument(node.data) : isCompositorNode(node) ? compositorDocument(node.data) : isRotateFlipNode(node) ? rotateFlipDocument(node.data) : isInvertNode(node) ? invertDocument(node.data) : isLevelsNode(node) ? levelsDocument(node.data) : isMatteGrowShrinkNode(node) ? matteGrowShrinkDocument(node.data) : isBlurNode(node) ? blurDocument(node.data) : isColorCorrectionNode(node) ? colorDocument(node.data) : isCropNode(node) ? cropDocument(node.data) : isPainterNode(node) ? painterDocument(node.data) : node.data })),
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
    if (signature(next) === signature(state.present)) { state.present = next; return; }
    // Coalesce consecutive editor updates, but keep graph edits separate.
    const dataOnly = nodes.length === state.present.nodes.length
      && nodes.every((node, i) => node.id === state.present.nodes[i].id
        && JSON.stringify(node.position) === JSON.stringify(state.present.nodes[i].position))
      && JSON.stringify(edges) === JSON.stringify(state.present.edges);
    const maskChanged = nodes.some(node => isMasksExtractorNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isMasksExtractorNode(previous) && previous.data.selection?.id !== node.data.selection?.id;
    })());
    const paintChanged = nodes.some(node => isPainterNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isPainterNode(previous) && JSON.stringify(previous.data.strokes) !== JSON.stringify(node.data.strokes);
    })());
    const cropChanged = nodes.some(node => isCropNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isCropNode(previous) && JSON.stringify(previous.data.rect) !== JSON.stringify(node.data.rect);
    })());
    const resizeChanged = nodes.some(node => isResizeNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isResizeNode(previous) && JSON.stringify(previous.data.settings) !== JSON.stringify(node.data.settings);
    })());
    const rotateFlipChanged = nodes.some(node => isRotateFlipNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isRotateFlipNode(previous) && JSON.stringify(previous.data.settings) !== JSON.stringify(node.data.settings);
    })());
    const levelsChanged = nodes.some(node => isLevelsNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isLevelsNode(previous) && JSON.stringify(previous.data.settings) !== JSON.stringify(node.data.settings);
    })());
    const matteChanged = nodes.some(node => isMatteGrowShrinkNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isMatteGrowShrinkNode(previous) && JSON.stringify(previous.data.settings) !== JSON.stringify(node.data.settings);
    })());
    const blurChanged = nodes.some(node => isBlurNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isBlurNode(previous) && JSON.stringify(previous.data.settings) !== JSON.stringify(node.data.settings);
    })());
    const colorChanged = nodes.some(node => isColorCorrectionNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isColorCorrectionNode(previous) && JSON.stringify(previous.data.settings) !== JSON.stringify(node.data.settings);
    })());
    const compositorChanged = nodes.some(node => isCompositorNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isCompositorNode(previous) && JSON.stringify(previous.data.document) !== JSON.stringify(node.data.document);
    })());
    const paletteChanged = nodes.some(node => isColorPaletteNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isColorPaletteNode(previous) && JSON.stringify(previous.data.colors) !== JSON.stringify(node.data.colors);
    })());
    const blendChanged = nodes.some(node => isBlendNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isBlendNode(previous) && JSON.stringify(previous.data.settings) !== JSON.stringify(node.data.settings);
    })());
    const iteratorChanged = nodes.some(node => isTextIteratorNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isTextIteratorNode(previous) && JSON.stringify(node.data.items.map(item => item.id)) !== JSON.stringify(previous.data.items.map(item => item.id));
    })());
    const imageIteratorChanged = nodes.some(node => isImageIteratorNode(node) && (() => {
      const previous = state.present.nodes.find(item => item.id === node.id);
      return isImageIteratorNode(previous) && (node.data.orderBy !== previous.data.orderBy || JSON.stringify(node.data.assets?.map(asset => asset.id)) !== JSON.stringify(previous.data.assets?.map(asset => asset.id)));
    })());
    const compareChanged = nodes.some(node => node.type === 'compare' && JSON.stringify(node.data) !== JSON.stringify(state.present.nodes.find(item => item.id === node.id)?.data));
    if (imageIteratorChanged || iteratorChanged || matteChanged || maskChanged || blendChanged || compareChanged || resizeChanged || paletteChanged || compositorChanged || rotateFlipChanged || levelsChanged || blurChanged || colorChanged || cropChanged || paintChanged || !dataOnly || Date.now() - state.time > 750) {
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
