import { EnsureResultAnnotationWorkflow, PromptAnnotationEdits, PromptAnnotationLinks } from './nodes/promptAnnotationEdits';
import { isAnnotationInput, restoreFileAnnotations, restoreInteractiveEditData, resultAnnotationDraftHandle } from './nodes/interactiveEdit';
import { annotationOutput, canAnnotateResult, isAnnotationSource, resultAnnotationDraft, selectedImageResult, withImageAnnotationHistories } from './nodes/annotationGraph';
import { migrateFileAnnotations } from './nodes/annotationMigration';
import { editImageAnnotationsFromPrompt, isInlineAnnotationLink, syncImageAnnotationPrompts } from './nodes/imageAnnotationPrompts';
import { isImageIteratorNode } from './nodes/types';
import { readImageIteratorData } from './nodes/imageIterator';
import { readTextIteratorData } from './nodes/textIterator';
import { restoreIdeogramData } from './nodes/ideogramClipboard';
import { restoreMasksData } from './nodes/masksExtractor';
import { restoreSeedreamData } from './nodes/seedreamClipboard';
import { restoreNanoBananaData } from './nodes/nanoBananaClipboard';
import { outputColor, outputKind, resolveOutputSource, routerFromOutput } from './nodes/router';
import { restoreBlendData } from './nodes/blend';
import { restoreCompareData } from './nodes/compare';
import { restoreResizeData } from './nodes/resize';
import { restorePaletteData } from './nodes/colorPalette';
import { restoreCompositorData } from './nodes/compositor';
import { restoreRotateFlipData } from './nodes/rotateFlip';
import { restoreInvertData } from './nodes/invert';
import { restoreLevelsData } from './nodes/levels';
import { restoreMatteGrowShrinkData } from './nodes/matteGrowShrink';
import { restoreBlurData } from './nodes/blur';
import { restoreColorData } from './nodes/colorCorrection';
import { restoreCropData } from './nodes/crop';
import { isPainterNode, isNodeLocked } from './nodes/types';
import { restorePainterData } from './nodes/painter';
import { restoreSunburstData } from './nodes/sunburstClipboard';
import { sunburstPreviewAspectRatio, sunburstProviderSettings, validateSunburstImageInputs } from './nodes/sunburst';
import { migrateSunburstProviderInput } from './nodes/sunburstMigration';
import { CanvasNavigation, canvasMinZoom, canvasMaxZoom, type ZoomTarget } from './components/CanvasNavigation';
import { CanvasSidebar, type CanvasTool } from './components/CanvasSidebar';
import { arrangeSelectedNodes, isArrangeShortcut } from './components/canvasLayout';
import { makeRoomForNodes } from './components/canvasInsertion';
import { useCanvasPlacementMotion } from './components/useCanvasPlacementMotion';
import { CanvasBackground } from './components/CanvasBackground';
import { canvasGridOrigin, readGridSnap, saveGridSnap, snapDragChanges, type GridDragAnchor } from './components/canvasGrid';
import { ApiSettingsDialog } from './components/ApiSettingsDialog';
import { testApiConnection } from './components/apiSettings';
import { NodePortLabelMotion } from './components/NodePortLabelMotion';
import { ConnectionMenu, type NodeMenuChoice } from './components/ConnectionMenu';
import { canConnect, withoutReplacedInput } from './nodes/connectionRules';
import { connectionChoices, choiceConnection, type PendingConnection } from './nodes/connectionRecommendations';
import { createLibraryNode, items } from './components/libraryCatalog';
import { hasImageModelCreationMenu } from './components/nodeMenuCatalog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ContextType, type CSSProperties } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useStoreApi,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type OnConnect,
  type OnConnectEnd,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnNodeDrag,
} from '@xyflow/react';

import { DescriberPanel } from './components/DescriberPanel';
import { ModelTasksProvider } from './components/ModelTasksProvider';
import { CanvasHistoryContext, useCanvasHistory } from './components/useCanvasHistory';
import { initialNodes, nodeTypes } from './nodes';
import { isDescriberNode, isImageGeneratorNode, isSunburstNode } from './nodes/types';
import type { AppNode } from './nodes/types';
import { isTextNode, textVariableCount, variableIndex } from './nodes/textVariables';
import { imagesFromDrop, isFileNode } from './nodes/fileAsset';
import { fileOutputKind, filePortColors, isFileAsset } from './nodes/fileCollection';
import { cloneTextNode } from './nodes/cloneTextNode';
import { documentText, initialTextDocument, variablePositions, withoutVariables } from './nodes/textDocument';
import { initialEdges, edgeTypes } from './edges';
import { ConnectionLine } from './edges/ConnectionLine';
import { curveOptions } from './edges/curve';
import { ConnectionEffectsContext, useConnectionEffects } from './edges/connectionEffects';
import { ConnectionEffectsLayer } from './edges/ConnectionEffectsLayer';
import { magneticDefaults } from './edges/magneticTypes';

import { WorkflowStorage, type Workflow } from './persistence/workflowStorage';
import { useWorkflowPersistence } from './persistence/useWorkflowPersistence';
import { ProjectLibrary, type CanvasProject } from './persistence/projectLibrary';
import { CanvasProjectHeader } from './components/CanvasProjectHeader';

const defaultEdgeOptions = { type: 'default', pathOptions: curveOptions };
type PendingNodeMenu = PendingConnection | (Pick<PendingConnection, 'screen' | 'position'> & { origin?: 'dock'; keyboard?: boolean });
const creationChoices: NodeMenuChoice[] = items.filter(item => item.nodeType).map(item => ({ id: item.id, itemId: item.id }));
const dockCreationChoices = creationChoices.filter(choice => !['position-logger', 'model-input'].includes(choice.itemId));

function availableConnectionChoices(pending: PendingConnection, nodes: AppNode[], edges: Edge[]) {
  return connectionChoices(pending, nodes, edges).filter(choice => {
    if (pending.direction !== 'source' || choice.itemId !== 'sunburst' || choice.handleId !== 'mask') return true;
    const node = createLibraryNode(choice.itemId, pending.position);
    return Boolean(node && canConnect(choiceConnection(pending, choice, node.id), [...nodes, node], edges));
  });
}

type ProjectSession = {
  project: CanvasProject;
  projects: CanvasProject[];
  refresh: (workflow: Workflow) => Promise<void>;
  open: (project: CanvasProject, workflow: Workflow) => Promise<void>;
  create: (workflow: Workflow) => Promise<void>;
  rename: (name: string) => Promise<void>;
  autoName: (prompt: string) => Promise<void>;
  remove: (project: CanvasProject, workflow: Workflow) => Promise<void>;
};

export function Flow({ storage, saved, projectSession }: { storage: WorkflowStorage; saved: Workflow | null; projectSession?: ProjectSession }) {
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [gridSnap, setGridSnap] = useState(() => readGridSnap());
  const colorMode = 'dark' as const;
  const [viewport, setViewport] = useState(saved?.viewport ?? { x: 0, y: 0, zoom: 1 });
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const [initialGraph] = useState(() => {
    const graph = migrateFileAnnotations(saved?.nodes ?? initialNodes, saved?.edges ?? initialEdges);
    return syncImageAnnotationPrompts(graph.nodes, graph.edges);
  });
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const { project: displayPlacement, play: playPlacement, stop: stopPlacement } = useCanvasPlacementMotion();
  const annotationGraph = useMemo(() => syncImageAnnotationPrompts(nodes, edges), [nodes, edges]);
  useLayoutEffect(() => {
    if (annotationGraph.nodes !== nodes) setNodes(annotationGraph.nodes);
    if (annotationGraph.edges !== edges) setEdges(annotationGraph.edges);
  }, [annotationGraph, nodes, edges, setNodes, setEdges]);
  const currentPromptEdges = useRef(edges);
  currentPromptEdges.current = edges;
  const annotationLinks = useMemo(() => annotationGraph.edges.filter(edge => isAnnotationInput(edge.targetHandle) && !edge.data?.annotationDismissed), [annotationGraph.edges]);
  const workflow = useMemo(() => ({ ...annotationGraph, viewport, colorMode }), [annotationGraph, viewport, colorMode]);
  const persistence = useWorkflowPersistence(storage, workflow);
  const withSavedWorkflow = async (action: (snapshot: Workflow) => Promise<void>) => {
    // Keep edits from arriving after the final flush while the destination loads.
    const canvas = canvasRef.current;
    canvas?.setAttribute('inert', '');
    try {
      if (!await persistence.flush()) throw new Error('当前画布尚未保存，请重试保存后再切换项目。');
      await action(workflow);
    } finally { canvas?.removeAttribute('inert'); }
  };
  const { screenToFlowPosition, flowToScreenPosition, getNodes, getEdges, getIntersectingNodes, getNodesBounds, fitView, getZoom } = useReactFlow<AppNode>();
  const pendingCreationFit = useRef<string[] | null>(null);
  const applyPromptAnnotationEdit = useCallback<NonNullable<ContextType<typeof PromptAnnotationEdits>>>(
    ({ nodeId, content, previousContent, removedHandles, restoreEdges }) => {
      const remove = (edge: Edge) => edge.target === nodeId && removedHandles.has(edge.targetHandle ?? '');
      const removed = currentPromptEdges.current.filter(edge => remove(edge) && !edge.data?.annotationDismissed);
      const currentNodes = getNodes();
      const { annotationsByNode, synced } = editImageAnnotationsFromPrompt(currentNodes, removed, restoreEdges);
      const positions = variablePositions(previousContent, removedHandles);
      const data = { content, text: documentText(content) };
      const update = (node: AppNode): AppNode => {
        if (node.id === nodeId && isTextNode(node)) return { ...node, data: { ...node.data, ...data } };
        const annotations = annotationsByNode.get(node.id);
        return annotations && isAnnotationSource(node) ? withImageAnnotationHistories(node, annotations) : node;
      };
      const graphNodes = currentNodes.map(update);
      // Commit the prompt and original image edit in one canvas undo snapshot.
      setNodes(nodes => nodes.map(update));
      setEdges(edges => {
        const retained = edges.flatMap(edge => {
          if (!remove(edge)) return [edge];
          // Keep the reference available for undo from the image or prompt.
          if (synced.has(edge.id)) return [{ ...edge, data: { ...edge.data, annotationDeletedFromPrompt: true,
            annotationPromptPositions: positions.get(edge.targetHandle ?? '') } }];
          return isInlineAnnotationLink(edge) ? [{ ...edge, data: { ...edge.data, annotationDismissed: true } }] : [];
        });
        for (const edge of restoreEdges) {
          const existing = retained.findIndex(item => item.target === nodeId && item.targetHandle === edge.targetHandle);
          const source = graphNodes.find(node => node.id === edge.source);
          if (annotationOutput(source, edge.sourceHandle, graphNodes, retained)) {
            if (existing < 0) retained.push(edge);
            else if (retained[existing].id === edge.id) retained[existing] = edge;
          }
        }
        return retained;
      });
      return removed;
    }, [getNodes, setEdges, setNodes],
  );
  const changeCanvasEdges = useCallback((changes: EdgeChange[]) => {
    const removed = new Set(changes.flatMap(change => change.type === 'remove' ? [change.id] : []));
    if (removed.size) {
      const handlesByPrompt = new Map<string, Set<string>>();
      for (const edge of currentPromptEdges.current) {
        const handle = edge.targetHandle;
        if (!removed.has(edge.id) || !handle || !isAnnotationInput(handle)) continue;
        const handles = handlesByPrompt.get(edge.target) ?? new Set<string>();
        handles.add(handle);
        handlesByPrompt.set(edge.target, handles);
      }
      // Apply the document and edge updates together so one canvas undo restores both.
      if (handlesByPrompt.size) setNodes(nodes => nodes.map(node => {
        const handles = handlesByPrompt.get(node.id);
        if (!handles || !isTextNode(node) || !node.data.content) return node;
        const content = withoutVariables(node.data.content, handles);
        return content === node.data.content ? node : { ...node, data: { ...node.data, content, text: documentText(content) } };
      }));
    }
    onEdgesChange(changes);
  }, [onEdgesChange, setNodes]);
  const { value: connectionEffects, start: startConnectionEffects, clear: clearConnectionEffects,
    connected: playConnectionEffects, created: playNodeEntrance, cancelled: connectionCancelled, connectionRadius,
    startClick: startClickConnection, end: endConnectionGesture, withinRadius: withinConnectionRadius } = useConnectionEffects();
  const ensureResultAnnotationWorkflow = useCallback((id: string, imageId: string, animate: boolean) => {
    const visible = getNodes();
    const positions = new Map(nodes.map(node => [node.id, node.position]));
    const current = visible.map(node => ({ ...node, position: positions.get(node.id) ?? node.position }));
    const source = current.find(node => node.id === id);
    if (!isImageGeneratorNode(source) || source.data.locked) return;
    const asset = selectedImageResult(source);
    if (!canAnnotateResult(asset) || asset.id !== imageId) return;
    const existingEdges = currentPromptEdges.current;
    const draft = resultAnnotationDraft(id, imageId, existingEdges);
    const existingPrompt = current.find(node => node.id === draft?.target && isTextNode(node));
    if (existingPrompt) {
      const inputFrom = (edge: Edge, nodeId: string, handle: string | null) => {
        const origin = resolveOutputSource(current.find(node => node.id === edge.source), edge.sourceHandle, current, existingEdges);
        return origin?.node.id === nodeId && (origin.handle ?? null) === handle;
      };
      const connected = current.some(node => isSunburstNode(node)
        && existingEdges.some(edge => edge.target === node.id && edge.targetHandle === 'prompt' && inputFrom(edge, existingPrompt.id, null))
        && existingEdges.some(edge => edge.target === node.id && /^image-\d+$/.test(edge.targetHandle ?? '') && inputFrom(edge, id, 'result')));
      if (connected) return;
    }

    const promptWidth = 454, promptHeight = 405, modelWidth = 456;
    const prompt = existingPrompt ?? createLibraryNode('text', { x: source.position.x, y: source.position.y - promptHeight - 48 });
    if (!prompt || !isTextNode(prompt)) return;
    const right = (node: AppNode, width: number) => node.position.x + (node.measured?.width ?? width);
    const model = createLibraryNode('sunburst', { x: Math.max(right(source, modelWidth), right(prompt, promptWidth)) + 100, y: source.position.y });
    if (!model || !isSunburstNode(model)) return;
    model.selected = false;
    if (model.data.provider === 'apimart') {
      Object.assign(model.data, sunburstProviderSettings(model.data, 'apimart', 'gpt-image-2.6'), { channelModel: 'gpt-image-2.6' });
    }
    if (model.data.outputFormat === 'gif' || model.data.outputFormat === 'svg') model.data.outputFormat = 'png';

    const imageEdge: Edge = { id: `edge-${crypto.randomUUID()}`, source: id, sourceHandle: 'result', target: model.id, targetHandle: 'image-0' };
    const promptEdge: Edge = { id: `edge-${crypto.randomUUID()}`, source: prompt.id, sourceHandle: null, target: model.id, targetHandle: 'prompt' };
    const addedNodes = existingPrompt ? [model] : [prompt, model];
    const graphNodes = [...current, ...addedNodes];
    if (!canConnect(imageEdge, graphNodes, existingEdges) || !canConnect(promptEdge, graphNodes, [...existingEdges, imageEdge])) return;
    const addedEdges = [imageEdge, promptEdge];
    if (!existingPrompt) {
      prompt.selected = false;
      prompt.data.content = initialTextDocument(prompt.data.text, [], prompt.id);
      addedEdges.push({ id: `edge-${crypto.randomUUID()}`, source: id, sourceHandle: 'result',
        target: prompt.id, targetHandle: resultAnnotationDraftHandle, data: { assetId: imageId } });
    }
    const [ratioWidth, ratioHeight = 1] = sunburstPreviewAspectRatio(model.data.provider, model.data.size).split('/').map(Number);
    const modelHeight = 120 + (modelWidth - 32) * ratioHeight / ratioWidth;
    const { positions: placement, pushes } = makeRoomForNodes(current, [
      ...(!existingPrompt ? [{ id: prompt.id, rect: { ...prompt.position, width: promptWidth, height: promptHeight }, direction: 'up' as const }] : []),
      { id: model.id, rect: { ...model.position, width: modelWidth, height: modelHeight }, direction: 'right' },
    ], new Set([source.id, prompt.id]));
    const place = (node: AppNode): AppNode => {
      const position = placement.get(node.id);
      return position ? { ...node, position } : node;
    };
    pendingCreationFit.current = [source.id, prompt.id, model.id];
    addedNodes.forEach(node => playNodeEntrance(null, node.id));
    if (animate) {
      for (const [nodeId, position] of placement) positions.set(nodeId, position);
      playPlacement(visible, positions, pushes);
    }
    else stopPlacement();
    setNodes(nodes => [...nodes, ...addedNodes].map(place));
    setEdges(edges => [...edges, ...addedEdges]);
  }, [getNodes, nodes, playNodeEntrance, playPlacement, stopPlacement, setNodes, setEdges]);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [importError, setImportError] = useState('');
  const [pendingNodeMenu, setPendingNodeMenu] = useState<PendingNodeMenu | null>(null);
  const [menuGeneration, setMenuGeneration] = useState(0);
  const openNodeMenu = useCallback((menu: PendingNodeMenu) => {
    setMenuGeneration(generation => generation + 1);
    setPendingNodeMenu(menu);
  }, []);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const dismissNodeMenu = useCallback(() => {
    if (document.activeElement?.closest('.node-add-menu')) {
      const dock = pendingNodeMenu && 'origin' in pendingNodeMenu && pendingNodeMenu.origin === 'dock';
      (dock ? addTrigger.current : canvasRef.current)?.focus({ preventScroll: true });
    }
    setPendingNodeMenu(null);
  }, [pendingNodeMenu]);
  const restore = useCallback((snapshot: { nodes: AppNode[]; edges: typeof edges }) => {
    clearConnectionEffects();
    stopPlacement();
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges, clearConnectionEffects, stopPlacement]);
  const history = useCanvasHistory(annotationGraph.nodes, annotationGraph.edges, restore);
  useLayoutEffect(() => { storage.releaseRestoredAssets(); }, [storage]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasStore = useStoreApi();
  const gridOrigin = useRef(canvasGridOrigin);
  const gridDragAnchor = useRef<GridDragAnchor | null>(null);
  const updateGridOrigin = useCallback((origin: number) => { gridOrigin.current = origin; }, []);
  const startGridDrag = useCallback<OnNodeDrag<AppNode>>((_event, node) => {
    if (!gridSnap) return;
    const absolute = canvasStore.getState().nodeLookup.get(node.id)?.internals.positionAbsolute;
    if (absolute) {
      gridDragAnchor.current = { id: node.id, offset: { x: absolute.x - node.position.x, y: absolute.y - node.position.y } };
    }
  }, [canvasStore, gridSnap]);
  const endGridDrag = useCallback(() => { gridDragAnchor.current = null; }, []);
  const changeCanvasNodes = useCallback((changes: NodeChange<AppNode>[]) => {
    if (changes.some(change => change.type === 'position' && change.position)) stopPlacement();
    const anchor = gridDragAnchor.current;
    onNodesChange(anchor ? snapDragChanges(changes, anchor, gridOrigin.current) : changes);
    // React Flow can send a final position batch without a stop callback when a drag is aborted.
    if (anchor && changes.some(change => change.type === 'position' && change.id === anchor.id && change.dragging === false)) {
      gridDragAnchor.current = null;
    }
  }, [onNodesChange, stopPlacement]);
  const toggleGridSnap = () => {
    const enabled = !gridSnap;
    setGridSnap(enabled);
    saveGridSnap(enabled);
  };
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.setProperty('--canvas-zoom', String(canvasStore.getState().transform[2]));
    return canvasStore.subscribe((current, previous) => {
      const zoom = current.transform[2];
      if (zoom !== previous.transform[2]) canvas.style.setProperty('--canvas-zoom', String(zoom));
    });
  }, [canvasStore]);
  const pendingZoom = useRef<ZoomTarget | null>(null);
  useEffect(() => {
    const pasteNode = (event: ClipboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"], [data-compositor-editor]')) return;
      try {
        const saved = JSON.parse(event.clipboardData?.getData('text/plain') ?? '');
        if (saved.format === 'momoflow-image-iterator-node' && saved.node?.type === 'image-iterator'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = readImageIteratorData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), {
            id: crypto.randomUUID(), type: 'image-iterator', selected: true,
            position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data: { ...data, locked: false },
          }]);
          return;
        }
        if (saved.format === 'momoflow-text-iterator-node' && saved.node?.type === 'text-iterator'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = readTextIteratorData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), {
            id: crypto.randomUUID(), type: 'text-iterator', selected: true,
            position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data: { ...data, locked: false },
          }]);
          return;
        }
        if (saved.format === 'momoflow-file-node' && saved.node?.type === 'file'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const assets = saved.node.data?.assets ?? (saved.node.data?.asset ? [saved.node.data.asset] : []);
          if (!Array.isArray(assets) || !assets.every(isFileAsset)) return;
          event.preventDefault();
          setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), {
            id: `file-${crypto.randomUUID()}`, type: 'file', selected: true,
            position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 },
            data: { label: typeof saved.node.data?.label === 'string' ? saved.node.data.label : undefined, assets,
              annotations: restoreFileAnnotations(saved.node.data?.annotations, assets),
              activeAssetId: typeof saved.node.data?.activeAssetId === 'string' ? saved.node.data.activeAssetId : undefined,
              viewMode: saved.node.data?.viewMode === 'all' ? 'all' : 'single',
              orderBy: saved.node.data?.orderBy === 'name' ? 'name' : 'date' },
          }]);
          return;
        }
        if ((saved.format === 'momoflow-preview-node' && saved.node?.type === 'preview' || saved.format === 'momoflow-router-node' && saved.node?.type === 'router')
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), {
            id: crypto.randomUUID(), type: saved.node.type, selected: true,
            position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 },
            data: { label: typeof saved.node.data?.label === 'string' ? saved.node.data.label : undefined },
          }]);
          return;
        }
        if (saved.format === 'momoflow-color-palette-node' && saved.node?.type === 'color-palette'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restorePaletteData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'color-palette', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-compositor-node' && saved.node?.type === 'compositor'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreCompositorData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'compositor', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-blend-node' && saved.node?.type === 'blend'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreBlendData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'blend', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-compare-node' && saved.node?.type === 'compare'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreCompareData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'compare', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-resize-node' && saved.node?.type === 'resize'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreResizeData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'resize', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-rotate-flip-node' && saved.node?.type === 'rotate-flip'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreRotateFlipData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'rotate-flip', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-interactive-edit-node' && saved.node?.type === 'interactive-edit'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreInteractiveEditData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          const assets = data.baseImage ? [data.baseImage] : [];
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: `file-${crypto.randomUUID()}`, type: 'file', selected: true,
            position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data: { label: data.label, assets,
              annotations: data.history && assets[0]?.id === data.history.imageId ? [data.history] : undefined } }]);
          return;
        }
        if (saved.format === 'momoflow-masks-extractor-node' && saved.node?.type === 'masks-extractor'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreMasksData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'masks-extractor', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-invert-node' && saved.node?.type === 'invert'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreInvertData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'invert', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-levels-node' && saved.node?.type === 'levels'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreLevelsData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'levels', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-matte-grow-shrink-node' && saved.node?.type === 'matte-grow-shrink'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreMatteGrowShrinkData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'matte-grow-shrink', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-blur-node' && saved.node?.type === 'blur'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreBlurData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'blur', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-color-correction-node' && saved.node?.type === 'color-correction'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreColorData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'color-correction', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-crop-node' && saved.node?.type === 'crop'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreCropData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'crop', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-painter-node' && saved.node?.type === 'painter'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restorePainterData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'painter', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-ideogram-node' && saved.node?.type === 'ideogram'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreIdeogramData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'ideogram', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-seedream-node' && saved.node?.type === 'seedream'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreSeedreamData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'seedream', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-nano-banana-node' && saved.node?.type === 'nano-banana'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreNanoBananaData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'nano-banana', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (saved.format === 'momoflow-sunburst-node' && saved.node?.type === 'sunburst'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreSunburstData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), { id: crypto.randomUUID(), type: 'sunburst', selected: true, position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 }, data }]);
          return;
        }
        if (['image-describer', 'model-input'].includes(saved.node?.type) && saved.format === `momoflow-${saved.node.type}-node`
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y) && typeof saved.node.data?.model === 'string') {
          const { type, data, position } = saved.node;
          if (type === 'image-describer' && (typeof data.text !== 'string' || typeof data.instructions !== 'string' || !Number.isInteger(data.imageInputs) || data.imageInputs < 1)) return;
          const copy: AppNode = { id: crypto.randomUUID(), type, selected: true, position: { x: position.x + 40, y: position.y + 40 },
            data: type === 'model-input' ? migrateSunburstProviderInput({ model: data.model, label: typeof data.label === 'string' ? data.label : undefined, parameter: ['provider', 'quality', 'background', 'size', 'outputFormat', 'aspectRatio', 'imageSize'].includes(data.parameter) ? data.parameter : undefined, options: Array.isArray(data.options) ? data.options.filter((v: unknown) => typeof v === 'string') : undefined }) : { model: data.model, text: data.text, instructions: data.instructions, imageInputs: data.imageInputs, exposed: [], ...(data.outputMode === 'manual' ? { outputMode: 'manual' as const } : {}) } } as AppNode;
          event.preventDefault();
          setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), copy]);
          return;
        }
        if (saved.format !== 'momoflow-text-node' || saved.node?.type !== 'text'
          || typeof saved.node.data?.text !== 'string'
          || !Number.isFinite(saved.node.position?.x) || !Number.isFinite(saved.node.position?.y)) return;
        const copy = cloneTextNode(saved.node);
        event.preventDefault();
        setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), copy]);
      } catch { /* Ordinary clipboard text belongs to the text editor. */ }
    };
    window.addEventListener('paste', pasteNode);
    return () => window.removeEventListener('paste', pasteNode);
  }, [setNodes]);
  const resultPromptConnection = useCallback((connection: Connection, current: AppNode[]) => {
    if (!/^image-\d+$/.test(connection.targetHandle ?? '')) return;
    const target = current.find(node => node.id === connection.target);
    const edges = currentPromptEdges.current;
    if (!isImageGeneratorNode(target) || target.type === 'ideogram' || edges.some(edge => edge.target === target.id && edge.targetHandle === 'prompt')) return;
    const origin = resolveOutputSource(current.find(node => node.id === connection.source), connection.sourceHandle, current, edges);
    if (origin?.handle !== 'result' || !isImageGeneratorNode(origin.node)) return;
    const image = selectedImageResult(origin.node);
    const draft = image && resultAnnotationDraft(origin.node.id, image.id, edges);
    if (!draft) return;
    const edge: Edge = { id: `edge-${crypto.randomUUID()}`, source: draft.target, sourceHandle: null, target: target.id, targetHandle: 'prompt' };
    return canConnect(edge, current, edges) ? edge : undefined;
  }, []);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connectionCancelled.current || !withinConnectionRadius(connection) || !canConnect(connection, getNodes(), getEdges())) return;
      const edge = addEdge(connection, [])[0];
      const prompt = resultPromptConnection(connection, getNodes());
      playConnectionEffects(edge, withoutReplacedInput(connection, getNodes(), getEdges()));
      setEdges((edges) => {
        const next = addEdge(edge, withoutReplacedInput(connection, getNodes(), edges));
        return prompt ? addEdge(prompt, next) : next;
      });
      setNodes((currentNodes) => currentNodes.map((node) =>
        node.id === connection.target && isTextNode(node) && !isAnnotationInput(connection.targetHandle)
          ? { ...node, data: { ...node.data, variableCount: Math.max(node.data.variableCount ?? 0, variableIndex(connection.targetHandle) + 2) } }
          : node,
      ));
    },
    [setEdges, setNodes, getNodes, getEdges, playConnectionEffects, connectionCancelled, withinConnectionRadius, resultPromptConnection]
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      endConnectionGesture();
      const { fromNode, fromHandle, isValid } = connectionState;
      if (connectionCancelled.current || isValid || !fromNode || !fromHandle || event.type === 'touchcancel') {
        return;
      }

      const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!pointer) return;

      // Touch events retain their starting target, so hit-test the release point.
      const dropTarget = document.elementFromPoint(pointer.clientX, pointer.clientY);
      if (!dropTarget?.classList.contains('react-flow__pane')) return;

      openNodeMenu({
        nodeId: fromNode.id, handleId: fromHandle.id ?? null, direction: fromHandle.type,
        screen: { x: pointer.clientX, y: pointer.clientY },
        position: screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }),
      });
    },
    [screenToFlowPosition, openNodeMenu, connectionCancelled, endConnectionGesture],
  );

  const createModelInputs = useCallback((model: AppNode, { connection, imageToImage = false }: { connection?: Connection; imageToImage?: boolean } = {}) => {
    if (!model.type || !hasImageModelCreationMenu(model.type)) return;
    if (connection?.target === model.id && connection.targetHandle === 'prompt') return;
    if (connection?.target === model.id) {
      const prompt = resultPromptConnection(connection, [...getNodes(), model]);
      if (prompt) {
        pendingCreationFit.current = [prompt.source, model.id];
        return { nodes: [], edges: [prompt] };
      }
    }

    const promptHeight = 405;
    const fileOffset = promptHeight + 48;
    const width = imageToImage ? 456 : 454;
    const height = imageToImage ? fileOffset + 540 : promptHeight;
    const position = { x: model.position.x - width - 100, y: model.position.y - (imageToImage ? fileOffset / 2 : 0) };
    // Keep the input nodes clear of existing nodes, including a connected reference image.
    const measuredNodes = getNodes().filter(node => node.measured?.width && node.measured.height);
    let overlaps = getIntersectingNodes({ ...position, width, height }, true, measuredNodes);
    while (overlaps.length > 0) {
      position.y = Math.min(...overlaps.map(node => node.position.y)) - height - 48;
      overlaps = getIntersectingNodes({ ...position, width, height }, true, measuredNodes);
    }

    const prompt = createLibraryNode('text', position);
    if (!prompt || !isTextNode(prompt)) return;
    prompt.selected = false;
    prompt.data.content = initialTextDocument(prompt.data.text, [], prompt.id);
    const inputs: AppNode[] = [prompt];
    const inputEdges: Edge[] = [{
      id: `edge-${crypto.randomUUID()}`, source: prompt.id, sourceHandle: null,
      target: model.id, targetHandle: 'prompt',
    }];
    if (imageToImage) {
      const file = createLibraryNode('file', { x: position.x, y: position.y + fileOffset });
      if (!file) return;
      file.selected = false;
      const imageEdge: Edge = {
        id: `edge-${crypto.randomUUID()}`, source: file.id, sourceHandle: 'file',
        target: model.id, targetHandle: 'image-0',
      };
      if (!canConnect(imageEdge, [prompt, file, model], inputEdges, file.id)) return;
      if (isSunburstNode(model)) {
        const { outputFormat, provider, channelModel } = model.data;
        try { validateSunburstImageInputs(outputFormat, true, false, provider, channelModel); }
        catch { model.data.outputFormat = 'png'; }
      }
      inputs.push(file);
      inputEdges.push(imageEdge);
    }
    pendingCreationFit.current = [...inputs, model].map(node => node.id);
    return { nodes: inputs, edges: inputEdges };
  }, [getIntersectingNodes, getNodes, resultPromptConnection]);

  useEffect(() => {
    const pending = pendingCreationFit.current;
    if (!pending) return;
    const created = nodes.filter(node => pending.includes(node.id));
    if (created.length !== pending.length) { pendingCreationFit.current = null; return; }
    if (created.some(node => !node.measured?.width || !node.measured.height)) return;
    pendingCreationFit.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const sidebarWidth = canvas.querySelector<HTMLElement>('.node-settings-panel.is-open')?.offsetWidth ?? 0;
    const rightInset = sidebarWidth + 28;
    const { x, y, width, height } = getNodesBounds(created);
    const topLeft = flowToScreenPosition({ x, y });
    const bottomRight = flowToScreenPosition({ x: x + width, y: y + height });
    if (topLeft.x < bounds.left + 72 || topLeft.y < bounds.top + 48
      || bottomRight.x > bounds.right - rightInset || bottomRight.y > bounds.bottom - 56) {
      void fitView({ nodes: created, maxZoom: getZoom(), padding: { left: '72px', right: `${rightInset}px`, top: '48px', bottom: '56px' } });
    }
  }, [nodes, flowToScreenPosition, getNodesBounds, fitView, getZoom]);

  const addNode = useCallback((itemId: string, position: AppNode['position'], { animate = true, imageModelCreationMode = 'text-to-image' }: {
    animate?: boolean; imageModelCreationMode?: NodeMenuChoice['imageModelCreationMode'];
  } = {}) => {
    const node = createLibraryNode(itemId, position);
    if (!node) return;
    const imageToImage = imageModelCreationMode === 'image-to-image';
    const inputs = imageModelCreationMode === 'model-only' ? undefined : createModelInputs(node, { imageToImage });
    if (imageToImage && !inputs) return;
    if (imageModelCreationMode === 'model-only') pendingCreationFit.current = [node.id];
    const created = [...(inputs?.nodes ?? []), node];
    if (animate) created.forEach(item => playNodeEntrance(null, item.id));
    setNodes(current => [...current.map(item => ({ ...item, selected: false })), ...created]);
    if (inputs) setEdges(current => [...current, ...inputs.edges]);
  }, [createModelInputs, playNodeEntrance, setNodes, setEdges]);

  const chooseNode = useCallback((selected: NodeMenuChoice) => {
    if (!pendingNodeMenu) return;
    if (!('nodeId' in pendingNodeMenu)) {
      addNode(selected.itemId, pendingNodeMenu.position, { imageModelCreationMode: selected.imageModelCreationMode });
      setPendingNodeMenu(null);
      return;
    }
    const pendingConnection = pendingNodeMenu;
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    // Recheck after the menu has been open: its node may have been locked or removed.
    const available = availableConnectionChoices(pendingConnection, currentNodes, currentEdges);
    const choice = available.find(item => item.id === selected.id);
    if (!choice) { setPendingNodeMenu(null); return; }
    const node = createLibraryNode(choice.itemId, pendingConnection.position);
    if (!node) return;
    if (isTextNode(node) && pendingConnection.direction === 'source' && !isAnnotationInput(choice.handleId)) node.data.variableCount = 2;
    if (choice.exposed && isDescriberNode(node)) node.data.exposed = [choice.exposed];
    const connection = choiceConnection(pendingConnection, choice, node.id);
    if (!canConnect(connection, [...currentNodes, node], currentEdges, node.type === 'file' ? node.id : undefined)) return;
    // Initialize the editor's connected document in the same graph transaction;
    // its mount must not add a second undo step after node creation.
    if (isTextNode(node)) {
      node.data.content = initialTextDocument(node.data.text, connection.target === node.id && connection.targetHandle ? [connection.targetHandle] : [], node.id);
      node.data.text = documentText(node.data.content);
    }
    // Place the new connecting port at the drop point, including reverse connections.
    node.position = {
      x: pendingConnection.position.x - (pendingConnection.direction === 'target' ? node.type === 'model-input' || node.type === 'router' ? 250 : 460 : 0),
      y: pendingConnection.position.y - choice.portY,
    };
    const edge: Edge = { ...connection, id: `edge-${crypto.randomUUID()}` };
    const inputs = createModelInputs(node, { connection });
    const color = isAnnotationInput(connection.targetHandle) ? 'var(--annotation-blue)' : outputColor(outputKind([...currentNodes, node].find(item => item.id === connection.source), connection.sourceHandle, [...currentNodes, node], currentEdges));
    playNodeEntrance(edge, node.id, pendingConnection.direction === 'source' ? 'target' : 'source', color);
    inputs?.nodes.forEach(item => playNodeEntrance(null, item.id));
    setNodes(current => [...current.map(item => {
      const deselected = { ...item, selected: false };
      return item.id === connection.target && isTextNode(item) && !isAnnotationInput(connection.targetHandle)
        ? { ...item, selected: false, data: { ...item.data, variableCount: Math.max(item.data.variableCount ?? 0, variableIndex(connection.targetHandle) + 2) } }
        : deselected;
    }), ...(inputs?.nodes ?? []), node]);
    setEdges(current => addEdge(edge, [...withoutReplacedInput(connection, currentNodes, current), ...(inputs?.edges ?? [])]));
    setPendingNodeMenu(null);
  }, [pendingNodeMenu, addNode, getNodes, getEdges, createModelInputs, setNodes, setEdges, playNodeEntrance]);

  const canvasNodes = useMemo(() => nodes.map((node) => (isFileNode(node) || isImageIteratorNode(node)) ? {
        ...node, draggable: !node.data.locked && tool === 'select',
        deletable: !node.data.locked, connectable: !node.data.locked && tool === 'select',
      } : isTextNode(node) ? {
        ...node,
        draggable: !node.data.locked && tool === 'select',
        deletable: !node.data.locked,
        connectable: !node.data.locked && tool === 'select',
        style: { ...node.style, height: undefined, minHeight: Math.max(405, 139 + (textVariableCount(node, edges) - 1) * 60) },
      } : (isImageGeneratorNode(node) || isPainterNode(node) || node.type === 'masks-extractor' || node.type === 'crop' || node.type === 'color-correction' || node.type === 'matte-grow-shrink' || node.type === 'blur' || node.type === 'levels' || node.type === 'invert' || node.type === 'rotate-flip' || node.type === 'blend' || node.type === 'compare' || node.type === 'resize' || node.type === 'compositor' || node.type === 'color-palette' || node.type === 'preview' || node.type === 'router' || node.type === 'text-iterator' || node.type === 'position-logger') ? { ...node, draggable: !isNodeLocked(node) && tool === 'select', deletable: !isNodeLocked(node), connectable: !isNodeLocked(node) && tool === 'select' } : node.type === 'model-input' && 'model' in node.data ? { ...node, draggable: !node.data.locked && tool === 'select', deletable: !node.data.locked, connectable: !node.data.locked && tool === 'select' } : isDescriberNode(node) ? { ...node, draggable: !node.data.locked && tool === 'select', deletable: !node.data.locked, connectable: !node.data.locked && tool === 'select', style: { ...node.style, minHeight: Math.max(380, 140 + (node.data.imageInputs + (node.data.exposed?.length ?? 0)) * 50) } } : node), [nodes, edges, tool]);
  const canvasEdges = useMemo(() => edges.flatMap((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        if (isAnnotationInput(edge.targetHandle)) return [];
        if (source?.type === 'router' || target?.type === 'router') return {
          ...edge, className: [edge.className, 'text-variable-edge'].filter(Boolean).join(' '),
          style: { ...edge.style, stroke: outputColor(outputKind(source, edge.sourceHandle, nodes, edges)) },
        };
        const fileSource = source && isFileNode(source) ? source : undefined;
        const textConnection = (source?.type === 'color-palette' && edge.sourceHandle === 'text') || nodes.some((node) => (isTextNode(node) || node.type === 'text-iterator' || node.type === 'image-describer' || node.type === 'model-input') && (node.id === edge.source || node.id === edge.target));
        const generatedSource = source && (source.type === 'image-iterator' || isImageGeneratorNode(source) || source.type === 'masks-extractor' || source.type === 'painter' || source.type === 'crop' || source.type === 'color-correction' || source.type === 'matte-grow-shrink' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'rotate-flip' || source.type === 'blend' || source.type === 'compare' || source.type === 'resize' || source.type === 'compositor' || (source.type === 'color-palette' && edge.sourceHandle === 'image'));
        const sunburstTarget = target && isImageGeneratorNode(target);
        const portColor = source?.type === 'matte-grow-shrink' || target?.type === 'matte-grow-shrink' || ((source?.type === 'painter' || source?.type === 'masks-extractor') && edge.sourceHandle === 'mask') || (sunburstTarget && edge.targetHandle === 'mask') ? 'var(--sunburst-mask-port)'
          : target?.type === 'image-describer' && /^image-\d+$/.test(edge.targetHandle ?? '') ? filePortColors.image
          : (sunburstTarget && /^image-\d+$/.test(edge.targetHandle ?? '')) || generatedSource ? 'var(--sunburst-image-port)'
          : fileSource ? filePortColors[fileOutputKind(fileSource.data)] : undefined;
        return fileSource || textConnection || generatedSource ? {
          ...edge, className: [edge.className, 'text-variable-edge'].filter(Boolean).join(' '),
          style: { ...edge.style, ...(portColor ? { stroke: portColor } : {}) },
        } : edge;
      }), [nodes, edges]);

  return (
    <EnsureResultAnnotationWorkflow.Provider value={ensureResultAnnotationWorkflow}><PromptAnnotationLinks.Provider value={annotationLinks}><PromptAnnotationEdits.Provider value={applyPromptAnnotationEdit}><CanvasHistoryContext.Provider value={history}><ConnectionEffectsContext.Provider value={connectionEffects}><ReactFlow
      ref={canvasRef}
      tabIndex={0}
      onPointerDownCapture={event => {
        if ((event.target as HTMLElement).classList.contains('react-flow__pane')) canvasRef.current?.focus({ preventScroll: true });
      }}
      minZoom={canvasMinZoom}
      maxZoom={canvasMaxZoom}
      proOptions={{ hideAttribution: true }}
      colorMode={colorMode}
      className={`canvas-tool-${tool} canvas-selection canvas-magnetic-connections`}
      data-multiple={nodes.filter(node => node.selected).length > 1}
      style={{ '--magnetic-line-width': `${magneticDefaults.lineWidth}px` } as CSSProperties}
      panOnDrag={tool === 'hand' ? [0, 1, 2] : [1, 2]}
      selectionOnDrag={tool === 'select'}
      selectionMode={SelectionMode.Partial}
      paneClickDistance={tool === 'select' ? 4 : undefined}
      nodesDraggable={tool === 'select'}
      nodesConnectable={tool === 'select'}
      elementsSelectable={tool === 'select'}
      nodes={displayPlacement(canvasNodes)}
      nodeTypes={nodeTypes}
      onNodesChange={changeCanvasNodes}
      onNodeDragStart={startGridDrag}
      onNodeDragStop={endGridDrag}
      onNodesDelete={deleted => {
        const ids = new Set(deleted.map(node => node.id));
        changeCanvasEdges(currentPromptEdges.current.filter(edge => ids.has(edge.source) || ids.has(edge.target))
          .map(edge => ({ type: 'remove', id: edge.id })));
      }}
      edges={canvasEdges}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineComponent={ConnectionLine}
      connectionRadius={connectionRadius}
      onEdgesChange={changeCanvasEdges}
      isValidConnection={(connection) => withinConnectionRadius(connection) && canConnect(connection, getNodes(), getEdges())}
      onDragOver={(event) => {
        const types = event.dataTransfer.types;
        const internal = types.includes('application/x-momoflow-asset') || types.includes('application/x-momoflow-library');
        const external = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html');
        if (!internal && !external) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = (event.target as HTMLElement).classList.contains('react-flow__pane')
          ? internal && !types.includes('application/x-momoflow-library') ? 'move' : 'copy' : 'none';
      }}
      onDrop={(event) => {
        const transfer = event.dataTransfer;
        if (transfer.types.includes('application/x-momoflow-library')) {
          event.preventDefault();
          if (!(event.target as HTMLElement).classList.contains('react-flow__pane')) return;
          addNode(transfer.getData('application/x-momoflow-library'), screenToFlowPosition({ x: event.clientX, y: event.clientY }), { animate: false });
          return;
        }
        if (transfer.types.includes('application/x-momoflow-asset')) { event.preventDefault(); return; }
        if (!transfer.types.some((type) => ['Files', 'text/uri-list', 'text/html'].includes(type))) return;
        // Never let a file drop navigate the browser. File-node media handles its own drops.
        event.preventDefault();
        if (!(event.target as HTMLElement).classList.contains('react-flow__pane')) return;
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const { assets, errors } = imagesFromDrop(transfer);
        setImportError(errors.join(' '));
        if (!assets.length) return;
        setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), {
          id: `file-${crypto.randomUUID()}`, type: 'file', position, selected: true,
          data: { assets, activeAssetId: assets[0].id },
        }]);
      }}
      onDoubleClickCapture={event => {
        const handle = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__handle.source');
        if (!handle || tool !== 'select') return;
        event.preventDefault(); event.stopPropagation();
        const bounds = handle.getBoundingClientRect();
        const port = screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
        const graph = routerFromOutput(handle.dataset.nodeid ?? '', handle.dataset.handleid ?? null,
          { x: port.x + 100, y: port.y - 31 }, getNodes(), getEdges(), crypto.randomUUID());
        if (graph) { setNodes(graph.nodes); setEdges(graph.edges); setPendingNodeMenu(null); }
      }}
      onPaneContextMenu={event => {
        if (!(event.target instanceof Element) || !event.target.classList.contains('react-flow__pane')) return;
        event.preventDefault();
        const screen = { x: event.clientX, y: event.clientY };
        openNodeMenu({ screen, position: screenToFlowPosition(screen) });
      }}
      onConnectStart={(event, params) => { startConnectionEffects(event, params); dismissNodeMenu(); }}
      onClickConnectStart={() => { startClickConnection(); dismissNodeMenu(); }}
      onMoveStart={event => {
        if (event) pendingZoom.current = null;
        dismissNodeMenu();
      }}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"], [data-compositor-editor]') || event.nativeEvent.isComposing) return;
        if (isArrangeShortcut({ ...event, isComposing: event.nativeEvent.isComposing })) {
          const state = canvasStore.getState();
          const blockedTarget = (event.target as HTMLElement).closest('button, select, [role="menu"], [role="dialog"], [role="listbox"], [contenteditable], .react-flow__panel');
          if (blockedTarget || apiSettingsOpen || pendingNodeMenu || state.connection.inProgress
            || state.userSelectionActive || nodes.some(node => node.dragging)
            || document.querySelector('[role="dialog"], [role="menu"], [data-compositor-editor]')) return;
          event.preventDefault();
          setNodes(current => arrangeSelectedNodes(current, getEdges(), gridSnap ? gridOrigin.current : undefined));
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) history.redo(); else history.undo();
        } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key.toLowerCase() === 'v') setTool('select');
          if (event.key.toLowerCase() === 'h') setTool('hand');
        }
        if (event.key === 'Escape' && !event.defaultPrevented) {
          setNodes((currentNodes) => currentNodes.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          ));
          setEdges(currentEdges => currentEdges.map(edge => edge.selected ? { ...edge, selected: false } : edge));
          if ((event.target as HTMLElement).closest('.react-flow__nodesselection-rect')) {
            canvasRef.current?.focus({ preventScroll: true });
          }
        }
      }}
      defaultViewport={saved?.viewport}
      onMoveEnd={(_event, next) => setViewport(next)}
      fitView={!saved}
    >
      <CanvasBackground onGridOriginChange={updateGridOrigin} />
      {projectSession && <CanvasProjectHeader project={projectSession.project} projects={projectSession.projects}
        nodeCount={nodes.length} status={persistence.status}
        refresh={() => projectSession.refresh(workflow)}
        open={project => withSavedWorkflow(snapshot => projectSession.open(project, snapshot))}
        create={() => withSavedWorkflow(projectSession.create)} rename={projectSession.rename}
        remove={project => withSavedWorkflow(snapshot => projectSession.remove(project, snapshot))} />}
      {pendingNodeMenu && <ConnectionMenu
        key={menuGeneration}
        screen={pendingNodeMenu.screen}
        animateEntrance={!('nodeId' in pendingNodeMenu)}
        instantEntrance={!('nodeId' in pendingNodeMenu) && pendingNodeMenu.keyboard}
        trigger={'origin' in pendingNodeMenu && pendingNodeMenu.origin === 'dock' ? addTrigger : undefined}
        mode={'nodeId' in pendingNodeMenu ? 'connect' : 'create'}
        choices={'nodeId' in pendingNodeMenu ? availableConnectionChoices(pendingNodeMenu, nodes, edges)
          : pendingNodeMenu.origin === 'dock' ? dockCreationChoices : creationChoices}
        onChoose={choice => { chooseNode(choice); canvasRef.current?.focus({ preventScroll: true }); }}
        onDismiss={dismissNodeMenu}
      />}
      {persistence.error && <Panel position="top-left" className="canvas-save-status" role="alert">
        <span>{persistence.error}</span>
        <button type="button" onClick={persistence.retry}>重试保存</button>
      </Panel>}
      <CanvasSidebar tool={tool} onToolChange={setTool} addTrigger={addTrigger}
        gridSnap={{ enabled: gridSnap, toggle: toggleGridSnap }}
        onApiSettings={() => { dismissNodeMenu(); setApiSettingsOpen(true); }}
        menuOpen={Boolean(pendingNodeMenu && 'origin' in pendingNodeMenu && pendingNodeMenu.origin === 'dock')}
        onAddMenu={keyboard => {
          if (pendingNodeMenu && 'origin' in pendingNodeMenu && pendingNodeMenu.origin === 'dock') {
            setPendingNodeMenu(null);
            return;
          }
          const anchor = addTrigger.current?.getBoundingClientRect();
          const bounds = canvasRef.current?.getBoundingClientRect();
          if (!anchor || !bounds) return;
          openNodeMenu({ origin: 'dock', keyboard, screen: { x: anchor.right + 12, y: anchor.top - 90 },
            position: screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }) });
        }} />
      <DescriberPanel onImageGenerated={projectSession?.autoName} />
      {importError && <Panel position="top-center" className="canvas-import-error" role="alert">
        <span>{importError}</span><button type="button" aria-label="Dismiss import error" onClick={() => setImportError('')}>×</button>
      </Panel>}
      <CanvasNavigation pendingZoom={pendingZoom} />
      <NodePortLabelMotion />
      <ApiSettingsDialog open={apiSettingsOpen} onClose={() => setApiSettingsOpen(false)} onTestConnection={testApiConnection} />
      <ConnectionEffectsLayer />
    </ReactFlow></ConnectionEffectsContext.Provider></CanvasHistoryContext.Provider></PromptAnnotationEdits.Provider></PromptAnnotationLinks.Provider></EnsureResultAnnotationWorkflow.Provider>
  );
}

export default function App({ projectLibrary }: { projectLibrary?: ProjectLibrary } = {}) {
  const [library] = useState(() => projectLibrary ?? new ProjectLibrary());
  const [projects, setProjects] = useState<CanvasProject[]>([]);
  const [loaded, setLoaded] = useState<{ project: CanvasProject; storage: WorkflowStorage; saved: Workflow | null }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const refreshProjects = useCallback(async () => {
    setProjects((await library.restore()).projects);
  }, [library]);
  useEffect(() => library.watchNames(() => { void refreshProjects().catch(() => {}); }), [library, refreshProjects]);
  useEffect(() => {
    let storage: WorkflowStorage | undefined;
    let cancelled = false;
    setError('');
    void library.restore().then(async restored => {
      if (cancelled) return;
      setProjects(restored.projects);
      const next = library.storage(restored.active);
      storage = next;
      const saved = await next.load();
      if (cancelled) { next.dispose(); return; }
      setLoaded({ project: restored.active, storage: next, saved });
    }).catch(cause => {
      storage?.dispose();
      if (!cancelled) setError(cause instanceof Error ? cause.message : '无法读取本地画布。');
    });
    return () => { cancelled = true; };
  }, [attempt, library]);
  useEffect(() => () => loaded?.storage.dispose(), [loaded]);
  useEffect(() => {
    if (!loaded?.saved) return;
    void library.backfillName(loaded.project, loaded.saved).then(async project => {
      if (project) await refreshProjects();
    }).catch(() => { /* The saved canvas stays usable if metadata cannot be updated. */ });
  }, [library, loaded, refreshProjects]);

  const projectId = loaded?.project.id;
  const autoName = useCallback(async (prompt: string) => {
    if (projectId && await library.autoName(projectId, prompt)) await refreshProjects();
  }, [library, projectId, refreshProjects]);

  const refresh = async (workflow: Workflow) => {
    if (!loaded) return;
    await library.updatePreview(loaded.project.id, workflow);
    await refreshProjects();
  };
  const open = async (project: CanvasProject) => {
    const storage = library.storage(project);
    try {
      const saved = await storage.load();
      if (!saved && project.id !== 'current') throw new Error('无法读取此项目的画布，原有数据已保留。');
      await library.select(project.id);
      const restored = await library.restore();
      setProjects(restored.projects);
      setLoaded({ project, storage, saved });
    } catch (cause) { storage.dispose(); throw cause; }
  };

  if (!loaded) return <div className="canvas-loading" role={error ? 'alert' : 'status'}>
    <p>{error ? `无法恢复画布：${error}` : '正在恢复画布…'}</p>
    {error && <><p>原有数据不会被覆盖。请检查浏览器存储权限后重试。</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>重试恢复</button></>}
  </div>;
  return (
    <ReactFlowProvider key={loaded.project.id}>
      <ModelTasksProvider><Flow storage={loaded.storage} saved={loaded.saved} projectSession={{
        project: projects.find(project => project.id === loaded.project.id) ?? loaded.project,
        projects, refresh, autoName,
        open: async (project, workflow) => { await refresh(workflow); await open(project); },
        create: async workflow => { await refresh(workflow); await open(await library.create()); },
        rename: async name => {
          await library.rename(loaded.project.id, name);
          await refreshProjects();
        },
        remove: async (project, workflow) => {
          await refresh(workflow);
          if (project.id !== loaded.project.id) {
            await library.remove(project.id);
            setProjects((await library.restore()).projects);
            return;
          }
          const remaining = (await library.restore()).projects.filter(item => item.id !== project.id);
          const fallback = remaining[0] ?? await library.create();
          const storage = library.storage(fallback);
          try {
            const saved = await storage.load();
            if (!saved && fallback.id !== 'current') throw new Error('无法读取下一个项目，当前项目已保留。');
            await library.remove(project.id, fallback.id);
            setProjects((await library.restore()).projects);
            setLoaded({ project: fallback, storage, saved });
          } catch (cause) { storage.dispose(); throw cause; }
        },
      }} /></ModelTasksProvider>
    </ReactFlowProvider>
  );
}
