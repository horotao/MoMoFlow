import { restoreMasksData } from './nodes/masksExtractor';
import { restoreNanoBananaData } from './nodes/nanoBananaClipboard';
import { outputColor, outputKind, routerFromOutput } from './nodes/router';
import { restoreBlendData } from './nodes/blend';
import { restoreCompareData } from './nodes/compare';
import { restoreResizeData } from './nodes/resize';
import { restorePaletteData } from './nodes/colorPalette';
import { restoreCompositorData } from './nodes/compositor';
import { restoreRotateFlipData } from './nodes/rotateFlip';
import { restoreInvertData } from './nodes/invert';
import { restoreLevelsData } from './nodes/levels';
import { restoreBlurData } from './nodes/blur';
import { restoreColorData } from './nodes/colorCorrection';
import { restoreCropData } from './nodes/crop';
import { isPainterNode, isNodeLocked } from './nodes/types';
import { restorePainterData } from './nodes/painter';
import { restoreSunburstData } from './nodes/sunburstClipboard';
import { CanvasSidebar } from './components/CanvasSidebar';
import { ConnectionMenu, type NodeMenuChoice } from './components/ConnectionMenu';
import { canConnect, withoutReplacedInput } from './nodes/connectionRules';
import { connectionChoices, choiceConnection, initializeConnectionParameter, type PendingConnection } from './nodes/connectionRecommendations';
import { createLibraryNode, items } from './components/libraryCatalog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type OnConnectEnd,
} from '@xyflow/react';

import { DescriberPanel } from './components/DescriberPanel';
import { ModelTasksProvider } from './components/ModelTasksProvider';
import { defaultInstructions } from './nodes/describer';
import { CanvasDock, type CanvasTool } from './components/CanvasDock';
import { CanvasHistoryContext, useCanvasHistory } from './components/useCanvasHistory';
import { initialNodes, nodeTypes } from './nodes';
import { isDescriberNode, isImageGeneratorNode } from './nodes/types';
import type { AppNode } from './nodes/types';
import { isTextNode, textVariableCount, variableIndex } from './nodes/textVariables';
import { imagesFromDrop, isFileNode } from './nodes/fileAsset';
import { fileOutputKind, filePortColors, isFileAsset } from './nodes/fileCollection';
import { cloneTextNode } from './nodes/cloneTextNode';
import { defaultTextNodeText } from './nodes/defaults';
import { initialEdges, edgeTypes } from './edges';
import { ConnectionLine } from './edges/ConnectionLine';
import { curveOptions } from './edges/curve';

import { WorkflowStorage, type Workflow } from './persistence/workflowStorage';
import { useWorkflowPersistence } from './persistence/useWorkflowPersistence';

const defaultEdgeOptions = { type: 'default', pathOptions: curveOptions };
type PendingNodeMenu = PendingConnection | Pick<PendingConnection, 'screen' | 'position'>;
const creationChoices: NodeMenuChoice[] = items.filter(item => item.nodeType).map(item => ({ id: item.id, itemId: item.id }));

export function Flow({ storage, saved }: { storage: WorkflowStorage; saved: Workflow | null }) {
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(saved?.colorMode ?? 'dark');
  const [viewport, setViewport] = useState(saved?.viewport ?? { x: 0, y: 0, zoom: 1 });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode === 'dark');
  }, [colorMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(saved?.nodes ?? initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved?.edges ?? initialEdges);
  const workflow = useMemo(() => ({ nodes, edges, viewport, colorMode }), [nodes, edges, viewport, colorMode]);
  const persistence = useWorkflowPersistence(storage, workflow);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow<AppNode>();
  const [tool, setTool] = useState<CanvasTool>('select');
  const [importError, setImportError] = useState('');
  const [pendingNodeMenu, setPendingNodeMenu] = useState<PendingNodeMenu | null>(null);
  const dismissNodeMenu = useCallback(() => setPendingNodeMenu(null), []);
  const restore = useCallback((snapshot: { nodes: AppNode[]; edges: typeof edges }) => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  useLayoutEffect(() => { storage.releaseRestoredAssets(); }, [storage]);
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pasteNode = (event: ClipboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"], [data-compositor-editor]')) return;
      try {
        const saved = JSON.parse(event.clipboardData?.getData('text/plain') ?? '');
        if (saved.format === 'momoflow-file-node' && saved.node?.type === 'file'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const assets = saved.node.data?.assets ?? (saved.node.data?.asset ? [saved.node.data.asset] : []);
          if (!Array.isArray(assets) || !assets.every(isFileAsset)) return;
          event.preventDefault();
          setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), {
            id: `file-${crypto.randomUUID()}`, type: 'file', selected: true,
            position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 },
            data: { label: typeof saved.node.data?.label === 'string' ? saved.node.data.label : undefined, assets,
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
            data: type === 'model-input' ? { model: data.model, label: typeof data.label === 'string' ? data.label : undefined, parameter: ['quality', 'background', 'size', 'outputFormat', 'aspectRatio', 'imageSize'].includes(data.parameter) ? data.parameter : undefined, options: Array.isArray(data.options) ? data.options.filter((v: unknown) => typeof v === 'string') : undefined } : { model: data.model, text: data.text, instructions: data.instructions, imageInputs: data.imageInputs, exposed: [] } } as AppNode;
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
  const addTextNode = useCallback(() => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;

    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: false })),
      {
        id: `text-${crypto.randomUUID()}`,
        type: 'text',
        position: screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        }),
        data: { text: defaultTextNodeText },
        selected: true,
      },
    ]);
  }, [screenToFlowPosition, setNodes]);
  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!canConnect(connection, getNodes(), getEdges())) return;
      setEdges((edges) => addEdge(connection, withoutReplacedInput(connection, getNodes(), edges)));
      setNodes((currentNodes) => currentNodes.map((node) =>
        node.id === connection.target && isTextNode(node)
          ? { ...node, data: { ...node.data, variableCount: Math.max(node.data.variableCount ?? 0, variableIndex(connection.targetHandle) + 2) } }
          : node,
      ));
    },
    [setEdges, setNodes, getNodes, getEdges]
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const { fromNode, fromHandle, isValid } = connectionState;
      if (isValid || !fromNode || !fromHandle || event.type === 'touchcancel') {
        return;
      }

      const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!pointer) return;

      // Touch events retain their starting target, so hit-test the release point.
      const dropTarget = document.elementFromPoint(pointer.clientX, pointer.clientY);
      if (!dropTarget?.classList.contains('react-flow__pane')) return;

      setPendingNodeMenu({
        nodeId: fromNode.id, handleId: fromHandle.id ?? null, direction: fromHandle.type,
        screen: { x: pointer.clientX, y: pointer.clientY },
        position: screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }),
      });
    },
    [screenToFlowPosition],
  );

  const chooseNode = useCallback((selected: NodeMenuChoice) => {
    if (!pendingNodeMenu) return;
    if (!('nodeId' in pendingNodeMenu)) {
      const node = createLibraryNode(selected.itemId, pendingNodeMenu.position);
      if (node) setNodes(current => [...current.map(item => ({ ...item, selected: false })), node]);
      setPendingNodeMenu(null);
      return;
    }
    const pendingConnection = pendingNodeMenu;
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    // Recheck after the menu has been open: its node may have been locked or removed.
    const available = connectionChoices(pendingConnection, currentNodes, currentEdges);
    const choice = available.find(item => item.id === selected.id);
    if (!choice) { setPendingNodeMenu(null); return; }
    const created = createLibraryNode(choice.itemId, pendingConnection.position);
    if (!created) return;
    const node = initializeConnectionParameter(created, pendingConnection, currentNodes);
    if (isTextNode(node) && pendingConnection.direction === 'source') node.data.variableCount = 2;
    if (choice.exposed && isDescriberNode(node)) node.data.exposed = [choice.exposed];
    const connection = choiceConnection(pendingConnection, choice, node.id);
    if (!canConnect(connection, [...currentNodes, node], currentEdges, node.type === 'file' ? node.id : undefined)) return;
    // Place the new connecting port at the drop point, including reverse connections.
    node.position = {
      x: pendingConnection.position.x - (pendingConnection.direction === 'target' ? node.type === 'model-input' || node.type === 'router' ? 250 : 460 : 0),
      y: pendingConnection.position.y - choice.portY,
    };
    setNodes(current => [...current.map(item => {
      const deselected = { ...item, selected: false };
      return item.id === connection.target && isTextNode(item)
        ? { ...item, selected: false, data: { ...item.data, variableCount: Math.max(item.data.variableCount ?? 0, variableIndex(connection.targetHandle) + 2) } }
        : deselected;
    }), node]);
    setEdges(current => addEdge({ ...connection, id: `edge-${crypto.randomUUID()}` }, withoutReplacedInput(connection, currentNodes, current)));
    setPendingNodeMenu(null);
  }, [pendingNodeMenu, getNodes, getEdges, setNodes, setEdges]);

  return (
    <CanvasHistoryContext.Provider value={history}><ReactFlow
      ref={canvasRef}
      minZoom={0.01}
      colorMode={colorMode}
      className={`canvas-tool-${tool}`}
      panOnDrag={tool === 'hand' ? [0, 1, 2] : [1, 2]}
      selectionOnDrag={tool === 'select'}
      nodesDraggable={tool === 'select'}
      nodesConnectable={tool === 'select'}
      elementsSelectable={tool === 'select'}
      nodes={nodes.map((node) => isFileNode(node) ? {
        ...node, draggable: !node.data.locked && tool === 'select',
        deletable: !node.data.locked, connectable: !node.data.locked && tool === 'select',
      } : isTextNode(node) ? {
        ...node,
        draggable: !node.data.locked && tool === 'select',
        deletable: !node.data.locked,
        connectable: !node.data.locked && tool === 'select',
        style: { ...node.style, height: undefined, minHeight: Math.max(405, 139 + (textVariableCount(node, edges) - 1) * 60) },
      } : (isImageGeneratorNode(node) || isPainterNode(node) || node.type === 'masks-extractor' || node.type === 'crop' || node.type === 'color-correction' || node.type === 'blur' || node.type === 'levels' || node.type === 'invert' || node.type === 'rotate-flip' || node.type === 'blend' || node.type === 'compare' || node.type === 'resize' || node.type === 'compositor' || node.type === 'color-palette' || node.type === 'preview' || node.type === 'router') ? { ...node, draggable: !isNodeLocked(node) && tool === 'select', deletable: !isNodeLocked(node), connectable: !isNodeLocked(node) && tool === 'select' } : node.type === 'model-input' && 'model' in node.data ? { ...node, draggable: !node.data.locked && tool === 'select', deletable: !node.data.locked, connectable: !node.data.locked && tool === 'select' } : isDescriberNode(node) ? { ...node, draggable: !node.data.locked && tool === 'select', deletable: !node.data.locked, connectable: !node.data.locked && tool === 'select', style: { ...node.style, minHeight: Math.max(380, 140 + (node.data.imageInputs + (node.data.exposed?.length ?? 0)) * 50) } } : node)}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      edges={edges.map((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        if (source?.type === 'router' || target?.type === 'router') return {
          ...edge, className: [edge.className, 'text-variable-edge'].filter(Boolean).join(' '),
          style: { ...edge.style, stroke: outputColor(outputKind(source, edge.sourceHandle, nodes, edges)) },
        };
        const fileSource = source && isFileNode(source) ? source : undefined;
        const textConnection = (source?.type === 'color-palette' && edge.sourceHandle === 'text') || nodes.some((node) => (isTextNode(node) || node.type === 'image-describer' || node.type === 'model-input') && (node.id === edge.source || node.id === edge.target));
        const generatedSource = source && (isImageGeneratorNode(source) || source.type === 'masks-extractor' || source.type === 'painter' || source.type === 'crop' || source.type === 'color-correction' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'rotate-flip' || source.type === 'blend' || source.type === 'compare' || source.type === 'resize' || source.type === 'compositor' || (source.type === 'color-palette' && edge.sourceHandle === 'image'));
        const sunburstTarget = target && isImageGeneratorNode(target);
        const portColor = ((source?.type === 'painter' || source?.type === 'masks-extractor') && edge.sourceHandle === 'mask') || (sunburstTarget && edge.targetHandle === 'mask') ? 'var(--sunburst-mask-port)'
          : target?.type === 'image-describer' && /^image-\d+$/.test(edge.targetHandle ?? '') ? filePortColors.image
          : (sunburstTarget && /^image-\d+$/.test(edge.targetHandle ?? '')) || generatedSource ? 'var(--sunburst-image-port)'
          : fileSource ? filePortColors[fileOutputKind(fileSource.data)] : undefined;
        return fileSource || textConnection || generatedSource ? {
          ...edge, className: [edge.className, 'text-variable-edge'].filter(Boolean).join(' '),
          style: { ...edge.style, ...(portColor ? { stroke: portColor } : {}) },
        } : edge;
      })}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineComponent={ConnectionLine}
      onEdgesChange={onEdgesChange}
      isValidConnection={(connection) => canConnect(connection, getNodes(), getEdges())}
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
          const node = createLibraryNode(transfer.getData('application/x-momoflow-library'), screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          if (node) setNodes(current => [...current.map(n => ({ ...n, selected: false })), node]);
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
        setPendingNodeMenu({ screen, position: screenToFlowPosition(screen) });
      }}
      onConnectStart={dismissNodeMenu}
      onMoveStart={dismissNodeMenu}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"], [data-compositor-editor]') || event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) history.redo(); else history.undo();
        } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key.toLowerCase() === 'v') setTool('select');
          if (event.key.toLowerCase() === 'h') setTool('hand');
        }
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          setNodes((currentNodes) => currentNodes.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          ));
        }
      }}
      defaultViewport={saved?.viewport}
      onMoveEnd={(_event, next) => setViewport(next)}
      fitView={!saved}
    >
      <Background />
      {pendingNodeMenu && <ConnectionMenu
        screen={pendingNodeMenu.screen}
        mode={'nodeId' in pendingNodeMenu ? 'connect' : 'create'}
        choices={'nodeId' in pendingNodeMenu ? connectionChoices(pendingNodeMenu, nodes, edges) : creationChoices}
        onChoose={chooseNode}
        onDismiss={dismissNodeMenu}
      />}
      <Panel position="bottom-left" className="canvas-save-status" role={persistence.error ? 'alert' : 'status'}>
        <span>{persistence.error || persistence.status}</span>
        {persistence.error && <button type="button" onClick={persistence.retry}>重试保存</button>}
      </Panel>
      <CanvasSidebar colorMode={colorMode} onThemeChange={() => setColorMode(mode => mode === 'dark' ? 'light' : 'dark')} />
      <DescriberPanel />
      {importError && <Panel position="top-center" className="canvas-import-error" role="alert">
        <span>{importError}</span><button type="button" aria-label="Dismiss import error" onClick={() => setImportError('')}>×</button>
      </Panel>}
      <CanvasDock tool={tool} onToolChange={setTool} colorMode={colorMode} {...history} />
      <MiniMap />
      <Controls showInteractive={false}>
        <ControlButton title="添加 Image Describer" aria-label="添加 Image Describer" onClick={() => {
          const bounds = canvasRef.current?.getBoundingClientRect();
          if (!bounds) return;
          const position = screenToFlowPosition({ x: bounds.left + bounds.width / 2 - 230, y: bounds.top + bounds.height / 2 - 200 });
          setNodes((all) => [...all.map((n) => ({ ...n, selected: false })), { id: crypto.randomUUID(), type: 'image-describer', selected: true, position, data: { text: '', model: 'deepseek-flash', instructions: defaultInstructions, imageInputs: 1 } }]);
        }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ fill: 'none' }}><rect x="3" y="3" width="13" height="13" rx="2" /><path d="m4 13 4-4 6 6m2-5h5v11H10v-4M13 3v3" /></svg></ControlButton>
        <ControlButton title="添加 File 节点" aria-label="添加 File 节点" onClick={() => {
          const bounds = canvasRef.current?.getBoundingClientRect();
          if (!bounds) return;
          const center = screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
          setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), {
            id: `file-${crypto.randomUUID()}`, type: 'file', selected: true,
            position: { x: center.x - 230, y: center.y - 279 }, data: {},
          }]);
        }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ fill: 'none' }} aria-hidden="true"><path d="M13 3H5v18h14V9zM13 3v6h6M8 15h8m-4-4v8" /></svg></ControlButton>
        <ControlButton onClick={addTextNode} title="添加文本节点" aria-label="添加文本节点">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4h16v3h-6.5v13h-3V7H4z" />
          </svg>
        </ControlButton>
        <ControlButton
          className="color-mode-toggle"
          onClick={() => setColorMode((mode) => mode === 'light' ? 'dark' : 'light')}
          title={colorMode === 'light' ? '切换至深色模式' : '切换至浅色模式'}
          aria-label={colorMode === 'light' ? '切换至深色模式' : '切换至浅色模式'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {colorMode === 'light' ? (
              <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </>
            )}
          </svg>
        </ControlButton>
      </Controls>
    </ReactFlow></CanvasHistoryContext.Provider>
  );
}

export default function App() {
  const [loaded, setLoaded] = useState<{ storage: WorkflowStorage; saved: Workflow | null }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const storage = new WorkflowStorage();
    let cancelled = false;
    setError('');
    void storage.load().then(saved => {
      if (cancelled) { storage.dispose(); return; }
      setLoaded({ storage, saved });
    }).catch(cause => {
      storage.dispose();
      if (!cancelled) setError(cause instanceof Error ? cause.message : '无法读取本地画布。');
    });
    return () => { cancelled = true; storage.dispose(); };
  }, [attempt]);

  if (!loaded) return <div className="canvas-loading" role={error ? 'alert' : 'status'}>
    <p>{error ? `无法恢复画布：${error}` : '正在恢复画布…'}</p>
    {error && <><p>原有数据不会被覆盖。请检查浏览器存储权限后重试。</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>重试恢复</button></>}
  </div>;
  return (
    <ReactFlowProvider>
      <ModelTasksProvider><Flow storage={loaded.storage} saved={loaded.saved} /></ModelTasksProvider>
    </ReactFlowProvider>
  );
}
