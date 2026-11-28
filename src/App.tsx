import { CanvasNodeActions, type NodeMenuLocation } from './components/CanvasNodeActions';
import { isNodeClipboard, readNodeGraph } from './nodes/nodeClipboard';
import { CanvasPortPointerContext, useCanvasPortPointer } from './components/image-prompt-node/canvasPortPointer';
import { CanvasColorTags } from './components/CanvasColorTags';
import './components/canvas-right-panels.css';
import { CanvasColorTagContext } from './components/CanvasColorTagContext';
import { changeColorTags, changeSelectedColorTags, nodeColorTags, type ColorTag } from './nodes/colorTags';
import { toggleSelectionLock } from './nodes/nodeLocks';
import { useCanvasNodeContents } from './nodes/useCanvasNodeContents';
import { CanvasMentionContext } from './nodes/CanvasMentionContext';
import { editPromptMentions, pruneChangedInputMentions, type MentionEdit, type MentionSources } from './nodes/promptMentions';
import { animateMentionWire } from './edges/mentionWireAnimation';
import { preventCanvasImageDrag, withCanvasImageDrag } from './components/canvasImageDrag';
import { ImageInspector } from './components/image-prompt-node/ImageInspector';
import { ImageInspectorElement } from './components/image-prompt-node/ImageInspectorContext';
import { TextInspector } from './components/image-prompt-node/TextInspector';
import { restoreSunburstData } from './nodes/sunburstClipboard';
import { CanvasNavigation, canvasMinZoom, canvasMaxZoom, type ZoomTarget } from './components/CanvasNavigation';
import { CanvasSidebar, type CanvasTool } from './components/CanvasSidebar';
import type { SelectionConnectionMenu } from './components/CanvasSelectionOutput';
import { selectionConnectionChoices, selectionTargetSize } from './nodes/selectionConnections';
import { CanvasSelectionOutline, CanvasSelectionToolbar } from './components/CanvasSelectionToolbar';
import { groupSelectedNodes, settleGroupDrop } from './nodes/canvasGroups';
import { duplicateDragChanges, duplicateNodes } from './nodes/duplicateNodes';
import { requestCanvasRun } from './nodes/selectionGeneration';
import { alignSelectedNodes, arrangeSelectedNodes, isArrangeShortcut } from './components/canvasLayout';
import { CanvasBackground } from './components/CanvasBackground';
import { canvasGridOrigin, readGridSnap, saveGridSnap, snapDragChanges, type GridDragAnchor } from './components/canvasGrid';
import { ApiSettingsDialog } from './components/ApiSettingsDialog';
import { testApiConnection } from './components/apiSettings';
import { addNodeEntries } from './components/add-node-menu/addNodeEntries';
import { AddNodeMenu, type AddNodeRequest } from './components/add-node-menu/AddNodeMenu';
import { canConnect, withoutReplacedInput } from './nodes/connectionRules';
import { connectionChoices, choiceConnection, type PendingConnection } from './nodes/connectionRecommendations';
import { defaultRouterLabel, routerLabel } from './nodes/router';
import { createLibraryNode } from './components/libraryCatalog';
import { createImportedVideo, isMp4File, readCanvasVideo } from './nodes/importCanvasVideo';
import { clipboardMediaFiles, createImportedCanvasImage, readCanvasImage } from './nodes/importCanvasImage';
import { assetResources, nodeAssetUrls } from './nodes/assetResources';
import { canvasImageSize } from './nodes/canvasImageGeometry';
import { composerAspectRatio } from './nodes/imageComposerSettings';
import { connectImageReferenceRatio } from './nodes/imageReferenceRatio';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useStore,
  useStoreApi,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type OnConnectEnd,
  type Edge,
  type NodeChange,
  type OnNodeDrag,
  type XYPosition,
} from '@xyflow/react';

import { DescriberPanel } from './components/DescriberPanel';
import { ModelTasksProvider } from './components/ModelTasksProvider';
import { CanvasHistoryContext, useCanvasHistory } from './components/useCanvasHistory';
import { initialNodes, nodeTypes } from './nodes';
import { isCanvasGroup, isCanvasRouter, isNodeLocked, type AppNode } from './nodes/types';
import { initialEdges, edgeTypes } from './edges';
import { ConnectionLine } from './edges/ConnectionLine';
import { useConnectionGesture } from './edges/useConnectionGesture';

import { WorkflowStorage, type Workflow } from './persistence/workflowStorage';
import { migrateLegacyImageGraph } from './persistence/legacyImageMigration';
import { useWorkflowPersistence } from './persistence/useWorkflowPersistence';
import { ProjectLibrary, type CanvasProject } from './persistence/projectLibrary';
import { CanvasProjectHeader } from './components/CanvasProjectHeader';

const defaultEdgeOptions = { type: 'default' };
const canvasDeleteKeys = ['Backspace', 'Delete'];
type PendingNodeMenu = PendingConnection | SelectionConnectionMenu | (Pick<PendingConnection, 'screen' | 'position'> & { origin: 'pane' | 'dock'; keyboard?: boolean });

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
  const [imageInspector, setImageInspector] = useState<HTMLElement | null>(null);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [mediaImportError, setMediaImportError] = useState('');
  const [gridSnap, setGridSnap] = useState(() => readGridSnap());
  const colorMode = 'dark' as const;
  const [viewport, setViewport] = useState(saved?.viewport ?? { x: 0, y: 0, zoom: 1 });
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const [initialGraph] = useState(() => migrateLegacyImageGraph(saved?.nodes ?? initialNodes, saved?.edges ?? initialEdges));
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [activeColorTags, setActiveColorTags] = useState<ColorTag[]>([]);
  const nodeContents = useCanvasNodeContents();
  const colorTagContext = useMemo(() => ({
    nodes: new Map(nodeContents.map(node => [node.id, { tags: nodeColorTags(node), locked: isNodeLocked(node) }])),
    active: activeColorTags,
    zoom: viewport.zoom,
    change: (id: string, color?: ColorTag) => setNodes(nodes => changeColorTags(nodes, [id], color)),
  }), [nodeContents, activeColorTags, viewport.zoom, setNodes]);
  const changeActiveColorTags = useCallback((colors: ColorTag[]) => {
    if (colors.some(color => !activeColorTags.includes(color))) {
      setNodes(current => current.map(node => node.selected ? { ...node, selected: false } : node));
      setEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
    }
    setActiveColorTags(colors);
  }, [activeColorTags, setNodes, setEdges]);
  const workflow = useMemo(() => ({ nodes, edges, viewport, colorMode }), [nodes, edges, viewport, colorMode]);
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
  const { screenToFlowPosition, getIntersectingNodes, getNodes, getEdges } = useReactFlow<AppNode>();
  const { start: startConnectionEffects, cancel: clearConnectionEffects, cancelled: connectionCancelled, connectionRadius,
    startClick: startClickConnection, end: endConnectionGesture, withinRadius: withinConnectionRadius } = useConnectionGesture(40, true);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [pendingNodeMenu, setPendingNodeMenu] = useState<PendingNodeMenu | null>(null);
  const [actionMenu, setActionMenu] = useState<NodeMenuLocation | null>(null);
  const selectionMenu = pendingNodeMenu && 'sourceIds' in pendingNodeMenu ? pendingNodeMenu : undefined;
  const [menuGeneration, setMenuGeneration] = useState(0);
  const openNodeMenu = useCallback((menu: PendingNodeMenu) => {
    setActionMenu(null);
    setMenuGeneration(generation => generation + 1);
    setPendingNodeMenu(menu);
  }, []);
  const paneMenu = pendingNodeMenu && 'origin' in pendingNodeMenu && pendingNodeMenu.origin === 'pane' ? pendingNodeMenu : null;
  const dockMenu = pendingNodeMenu && 'origin' in pendingNodeMenu && pendingNodeMenu.origin === 'dock';
  const importPicker = useRef<HTMLInputElement>(null);
  const importPosition = useRef<XYPosition | null>(null);
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
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges, clearConnectionEffects]);
  const history = useCanvasHistory(nodes, edges, restore);
  useLayoutEffect(() => { storage.releaseRestoredAssets(); }, [storage]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomScope = useId();
  const canvasPointer = useRef<XYPosition | null>(null);
  const contextPress = useRef<XYPosition | null>(null);
  const canvasStore = useStoreApi();
  const registerPortPointer = useCanvasPortPointer();
  useEffect(() => {
    // The pointer scopes these shortcuts even when a canvas control still has focus.
    const addNodeShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const entry = addNodeEntries.find(item => item.key === event.key.toUpperCase());
      if (!entry) return;

      const canvas = canvasRef.current;
      const pointer = canvasPointer.current;
      if (!canvas || !pointer || canvas.hasAttribute('inert') || apiSettingsOpen || pendingNodeMenu) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], .image-edit-mode')) return;
      const hit = document.elementFromPoint(pointer.x, pointer.y);
      if (!canvas.contains(hit?.closest('.react-flow__pane') ?? null) || hit?.closest('.image-edit-mode')) return;
      if (document.querySelector('dialog[open], [role="dialog"], [role="menu"]:not([data-state="closed"]), [role="listbox"]:not([data-state="closed"])')) return;

      const state = canvasStore.getState();
      if (canvas.querySelector('.canvas-selection-output[data-dragging]') || state.paneDragging || state.userSelectionActive || state.connection.inProgress || state.connectionClickStartHandle
        || state.nodes.some(node => node.dragging || node.resizing)) return;

      const position = screenToFlowPosition(pointer);
      const node = createLibraryNode(entry.type, position);
      if (!node) return;
      // The factory stores a top-center anchor. Match the actual preset width.
      if (node.type === 'sunburst') node.position.x = position.x + canvasImageSize(composerAspectRatio(node.data)).width / 2;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      setNodes(current => [...current.map(item => ({ ...item, selected: false })), node]);
    };
    window.addEventListener('keydown', addNodeShortcut, true);
    return () => window.removeEventListener('keydown', addNodeShortcut, true);
  }, [apiSettingsOpen, canvasStore, pendingNodeMenu, screenToFlowPosition, setNodes]);
  const gridOrigin = useRef(canvasGridOrigin);
  const gridDragAnchor = useRef<GridDragAnchor | null>(null);
  const duplicateDrag = useRef<{ ids: Map<string, string>; active: boolean } | null>(null);
  const updateGridOrigin = useCallback((origin: number) => { gridOrigin.current = origin; }, []);
  const startGridDrag = useCallback<OnNodeDrag<AppNode>>((event, node, dragged) => {
    duplicateDrag.current = null;
    if ('altKey' in event && event.altKey) {
      const copies = duplicateNodes(getNodes(), getEdges(), dragged.map(item => item.id));
      if (copies.nodes.length) {
        duplicateDrag.current = { ids: copies.ids, active: true };
        setNodes(current => [...current.map(item => ({ ...item, selected: false })), ...copies.nodes]);
        setEdges(current => [...current.map(edge => ({ ...edge, selected: false })), ...copies.edges]);
      }
    }
    if (!gridSnap) return;
    const absolute = canvasStore.getState().nodeLookup.get(node.id)?.internals.positionAbsolute;
    if (absolute) {
      gridDragAnchor.current = { id: node.id, offset: { x: absolute.x - node.position.x, y: absolute.y - node.position.y } };
    }
  }, [canvasStore, gridSnap, getNodes, getEdges, setNodes, setEdges]);
  const finishCanvasDrag = useCallback<OnNodeDrag<AppNode>>((event, _node, dragged) => {
    gridDragAnchor.current = null;
    const copies = duplicateDrag.current;
    duplicateDrag.current = null;
    if (event.type === 'touchcancel' && !copies) return;
    const ids = copies ? [...copies.ids.values()] : dragged.map(node => node.id);
    // React Flow queues the final position changes before this callback.
    setNodes(current => settleGroupDrop(copies
      ? current.map(node => ids.includes(node.id) ? { ...node, dragging: false } : node) : current, ids));
  }, [setNodes]);
  const changeCanvasNodes = useCallback((changes: NodeChange<AppNode>[]) => {
    const anchor = gridDragAnchor.current;
    const snapped = anchor ? snapDragChanges(changes, anchor, gridOrigin.current) : changes;
    const copies = duplicateDrag.current;
    onNodesChange(copies?.active ? duplicateDragChanges(snapped, copies.ids) : snapped);
    if (copies?.active && changes.some(change => change.type === 'position' && copies.ids.has(change.id) && change.dragging === false)) {
      copies.active = false;
    }
    // React Flow can send a final position batch without a stop callback when a drag is aborted.
    if (anchor && changes.some(change => change.type === 'position' && change.id === anchor.id && change.dragging === false)) {
      gridDragAnchor.current = null;
    }
  }, [onNodesChange]);
  const toggleGridSnap = () => {
    const enabled = !gridSnap;
    setGridSnap(enabled);
    saveGridSnap(enabled);
  };
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Limit zoom-dependent styles to controls that use them. Inheriting a changing
    // variable from the canvas invalidates every image, editor and hidden toolbar.
    const style = document.createElement('style');
    style.textContent = `[data-zoom-scope="${CSS.escape(zoomScope)}"] :is(
      .image-node-heading, .image-node-toolbar-bridge, .image-node-port-ring, .image-node-port-dot,
      .workflow-wire-hit, .canvas-group, .canvas-group-resize-frame, .image-crop-editor,
      .image-inpaint-editor, .image-node-reference
    ) {}`;
    canvas.append(style);
    const rule = style.sheet!.cssRules[0] as CSSStyleRule;
    const updateZoom = (zoom: number) => {
      rule.style.setProperty('--canvas-zoom', String(zoom));
      const percent = Math.round(zoom * 100);
      const heading = percent <= 7 ? 'hidden' : percent <= 14 ? 'icon' : 'labels';
      if (canvas.dataset.nodeHeading !== heading) canvas.dataset.nodeHeading = heading;
    };
    updateZoom(canvasStore.getState().transform[2]);
    const unsubscribe = canvasStore.subscribe((current, previous) => {
      const zoom = current.transform[2];
      if (zoom !== previous.transform[2]) updateZoom(zoom);
    });
    return () => { unsubscribe(); style.remove(); };
  }, [canvasStore, zoomScope]);
  const pendingZoom = useRef<ZoomTarget | null>(null);
  const onConnect: OnConnect = useCallback(connection => {
    if (connectionCancelled.current || !withinConnectionRadius(connection) || !canConnect(connection, getNodes(), getEdges())) return;
    const previous = getEdges();
    const next = addEdge(connection, withoutReplacedInput(connection, previous));
    setNodes(current => connectImageReferenceRatio(pruneChangedInputMentions(current, previous, next), previous, next, connection.target));
    setEdges(next);
  }, [connectionCancelled, withinConnectionRadius, getNodes, getEdges, setNodes, setEdges]);

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

      const pending: PendingConnection = {
        nodeId: fromNode.id, handleId: fromHandle.id ?? null, direction: fromHandle.type,
        screen: { x: pointer.clientX, y: pointer.clientY },
        position: screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }),
      };
      if (connectionChoices(pending, getNodes(), getEdges()).length) openNodeMenu(pending);
    },
    [screenToFlowPosition, openNodeMenu, connectionCancelled, endConnectionGesture, getNodes, getEdges],
  );

  function addNodes({ type, quantity }: AddNodeRequest) {
    if (!pendingNodeMenu) return;
    const pending = 'nodeId' in pendingNodeMenu ? pendingNodeMenu : null;
    const currentNodes = getNodes(), currentEdges = getEdges();
    const batchChoice = selectionMenu && selectionConnectionChoices(currentNodes, selectionMenu.sourceIds, currentEdges).find(item => item.itemId === type);
    const choice = pending && connectionChoices(pending, currentNodes, currentEdges).find(item => item.itemId === type);
    if ((pending && !choice) || (selectionMenu && !batchChoice)) return;
    const created: AppNode[] = [], connections: Edge[] = [];
    const dropPoints = new Map<string, XYPosition>();
    for (let i = 0; i < quantity; i++) {
      const position = {
        x: pendingNodeMenu.position.x - (choice?.portX ?? 0) + (i % 4) * 512,
        y: pendingNodeMenu.position.y - (choice?.portY ?? 0) + Math.floor(i / 4) * 512,
      };
      const node = createLibraryNode(type, position);
      if (!node) return;
      if (node.type === 'router') {
        const labels = new Set([...currentNodes, ...created].filter(isCanvasRouter).map(item => routerLabel(item.data)));
        let number = 1;
        while (labels.has(node.data.label)) node.data.label = defaultRouterLabel + ' ' + number++;
      }
      if (selectionMenu) dropPoints.set(node.id, position);
      const links = batchChoice ? batchChoice.links.map(link => ({ ...link, target: node.id }))
        : pending && choice ? [choiceConnection(pending, choice, node.id)] : [];
      for (const link of links) {
        if (!canConnect(link, [...currentNodes, ...created, node], [...currentEdges, ...connections])) return;
        connections.push({ ...link, id: crypto.randomUUID() });
      }
      created.push(node);
    }
    const retainedEdges = pending?.direction === 'target' ? withoutReplacedInput(connections[0], currentEdges) : currentEdges;
    const nextEdges = [...retainedEdges, ...connections];
    setNodes(current => {
      let next = [...pruneChangedInputMentions(current, currentEdges, nextEdges).map(node => ({ ...node, selected: false })), ...created];
      for (const target of new Set(connections.map(link => link.target))) next = connectImageReferenceRatio(next, currentEdges, nextEdges, target);
      if (selectionMenu) {
        const sources = current.filter(node => selectionMenu.sourceIds.includes(node.id));
        next = next.map(node => {
          const drop = dropPoints.get(node.id);
          if (!drop) return node;
          const size = selectionTargetSize(node, sources);
          return { ...node, position: { x: drop.x + size.width / 2, y: drop.y - size.height / 2 } };
        });
      }
      return next;
    });
    if (connections.length) setEdges(nextEdges);
  }

  const addMediaFiles = useCallback(async (files: File[], position: XYPosition, canvas: HTMLDivElement) => {
    setMediaImportError('');
    const settled = await Promise.allSettled(files.map(file => isMp4File(file) ? readCanvasVideo(file) : readCanvasImage(file)));
    const assets = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (canvasRef.current !== canvas || canvas.hasAttribute('inert')) {
      assetResources.discard(assets.map(asset => asset.url));
      return;
    }
    const failures = files.length - assets.length;
    if (failures) {
      const only = settled.length === 1 ? settled[0] : undefined;
      setMediaImportError(only?.status === 'rejected' && only.reason instanceof Error
        ? only.reason.message : `${failures} 个文件无法导入。请选择浏览器支持的图片或 MP4 视频。`);
    }
    if (!assets.length) return;
    let x = position.x;
    const imported = assets.map(asset => {
      const item = asset.kind === 'video' ? createImportedVideo(asset, { x, y: position.y }) : createImportedCanvasImage(asset, { x, y: position.y });
      x += canvasImageSize('auto', asset).width + 64;
      return item;
    });
    setNodes(current => [...current.map(node => ({ ...node, selected: false })), ...imported]);
  }, [setNodes]);

  const pasteText = useCallback((plain: string, position: XYPosition, canvas: HTMLDivElement, atMenu = false) => {
    if (isNodeClipboard(plain)) {
      void readNodeGraph(plain, position).then(graph => {
        if (canvasRef.current !== canvas || canvas.hasAttribute('inert')) {
          assetResources.discard(nodeAssetUrls(graph.nodes));
          return;
        }
        setNodes(current => [...current.map(n => n.selected ? { ...n, selected: false } : n), ...graph.nodes]);
        setEdges(current => [...current.map(e => e.selected ? { ...e, selected: false } : e), ...graph.edges]);
      }).catch(error => setMediaImportError(error instanceof Error ? error.message : '粘贴节点失败。'));
      return true;
    }
    if (plain) {
      try {
        const saved = JSON.parse(plain);
        if (saved?.format === 'momoflow-sunburst-node' && saved.node?.type === 'sunburst'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreSunburstData(saved.node.data);
          if (data) {
            const { nodes: pasted } = migrateLegacyImageGraph([{
              id: crypto.randomUUID(), type: 'sunburst', position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 },
              origin: saved.node.origin?.[0] === 0.5 && saved.node.origin?.[1] === 0 ? [0.5, 0] : undefined, data,
            }], []);
            setNodes(current => [...current.map(node => ({ ...node, selected: false })), ...pasted.map(node => ({ ...node, selected: true, position: atMenu ? position : node.position }))]);
            return true;
          }
        }
      } catch { /* Clipboard text can accompany an image. */ }
    }
    return false;
  }, [setNodes, setEdges]);

  const pasteClipboardData = useCallback((clipboard: DataTransfer, position: XYPosition, atMenu = false) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.hasAttribute('inert')) return false;
    if (pasteText(clipboard.getData('text/plain'), position, canvas, atMenu)) return true;
    const files = clipboardMediaFiles(clipboard);
    if (!files.length) return false;
    void addMediaFiles(files, position, canvas);
    return true;
  }, [addMediaFiles, pasteText]);

  async function pasteAtMenu(position: XYPosition) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!navigator.clipboard?.read) {
      const plain = await navigator.clipboard?.readText();
      if (canvas !== canvasRef.current || canvas.hasAttribute('inert')) return;
      if (plain && pasteText(plain, position, canvas, true)) return;
      throw new Error('请在画布上使用粘贴快捷键。');
    }
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      if (item.types.includes('text/plain')) {
        const plain = items.length === 1 && item.types.length === 1 && navigator.clipboard.readText
          ? await navigator.clipboard.readText() : await (await item.getType('text/plain')).text();
        if (canvas !== canvasRef.current || canvas.hasAttribute('inert')) return;
        if (pasteText(plain, position, canvas, true)) return;
      }
      const type = item.types.find(type => type.startsWith('image/') || type === 'video/mp4');
      if (type) files.push(new File([await item.getType(type)], 'Clipboard.' + type.split('/')[1], { type }));
    }
    if (files.length) await addMediaFiles(files, position, canvas);
    else throw new Error('剪贴板中没有可粘贴的节点、图片或 MP4 视频。');
  }

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const canvas = canvasRef.current;
      const clipboard = event.clipboardData;
      const target = event.target;
      if (!canvas || !clipboard || event.defaultPrevented || canvas.hasAttribute('inert')) return;
      if (target instanceof Element) {
        if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="dialog"]')) return;
        if (target !== document.body && target !== document.documentElement && !canvas.contains(target)) return;
      }
      if (document.querySelector('dialog[open]') || canvas.querySelector('.image-edit-mode')) return;

      const pointer = canvasPointer.current;
      const surface = pointer && document.elementFromPoint(pointer.x, pointer.y)?.closest('.react-flow__pane, .react-flow__node');
      const bounds = canvas.getBoundingClientRect();
      const screen = pointer && canvas.contains(surface || null)
        ? pointer : { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      if (!pasteClipboardData(clipboard, screenToFlowPosition(screen))) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [pasteClipboardData, screenToFlowPosition]);

  const selecting = useStore(state => state.userSelectionActive);
  const selectedNodes = nodes.filter(node => node.selected);
  const multiple = selectedNodes.length > 1;
  const actionNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
  const hideSelectedPorts = selecting || multiple;
  const [decoratedNodes] = useState(() => new WeakMap<AppNode, AppNode>());
  const canvasNodes = useMemo(() => {
    const lockedGroups = new Set(nodes.filter(node => node.parentId && isNodeLocked(node)).map(node => node.parentId));
    const selectedGroups = new Set(nodes.filter(node => isCanvasGroup(node) && node.selected).map(node => node.id));
    return nodes.map(node => {
      const locked = isNodeLocked(node) || lockedGroups.has(node.id);
      const editable = !locked && tool === 'select';
      const group = isCanvasGroup(node);
      const memberClass = node.parentId && selectedGroups.has(node.parentId) && !node.selected ? ' canvas-group-member-in-selected-frame' : '';
      const portsClass = hideSelectedPorts && node.selected ? ' canvas-node-ports-hidden' : '';
      const className = group ? 'canvas-group-node' : `canvas-image-node${memberClass}${portsClass}`;
      // React Flow uses input object identity to skip updates to stationary nodes.
      const previous = decoratedNodes.get(node);
      if (previous?.className === className && previous.draggable === editable && previous.deletable === !locked) return previous;
      const props = { draggable: editable, deletable: !locked, className };
      const decorated = group ? { ...node, ...props, connectable: false, ariaLabel: node.data.label }
        : withCanvasImageDrag({ ...node, ...props, connectable: editable });
      decoratedNodes.set(node, decorated);
      return decorated;
    });
  }, [nodes, tool, hideSelectedPorts, decoratedNodes]);
  function openNodeActions(event: React.MouseEvent, id: string) {
    if (event.button !== 2 && !event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    const start = contextPress.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    if (canvasStore.getState().connection.inProgress || canvasRef.current?.querySelector('.image-edit-mode')) return;
    dismissNodeMenu();
    setEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
    setNodes(current => current.map(node => Boolean(node.selected) === (node.id === id) ? node : { ...node, selected: node.id === id }));
    canvasStore.setState({ nodesSelectionActive: false });
    setActionMenu({ id, screen: { x: event.clientX, y: event.clientY } });
  }
  const arrangeSelection = () => {
    setNodes(current => arrangeSelectedNodes(current, getEdges(), gridSnap ? gridOrigin.current : undefined));
  };

  const commitMention = useCallback((id: string, edit: MentionEdit, sourceId?: MentionSources) => {
    const result = editPromptMentions(id, edit, getNodes(), getEdges(), sourceId, crypto.randomUUID());
    if (!result) return false;
    result.addedEdges.forEach(edge => animateMentionWire(edge.id));
    setNodes(result.nodes); setEdges(result.edges);
    return true;
  }, [getNodes, getEdges, setNodes, setEdges]);

  return (
    <CanvasPortPointerContext.Provider value={registerPortPointer}><CanvasColorTagContext.Provider value={colorTagContext}><CanvasMentionContext.Provider value={commitMention}><CanvasHistoryContext.Provider value={history}><ImageInspectorElement.Provider value={imageInspector}><ReactFlow
      ref={canvasRef}
      data-zoom-scope={zoomScope}
      tabIndex={0}
      onDragStartCapture={preventCanvasImageDrag}
      onPointerMoveCapture={event => {
        if (event.pointerType === 'mouse') canvasPointer.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') canvasPointer.current = null; }}
      onPointerDownCapture={event => {
        contextPress.current = event.button === 2 || event.ctrlKey ? { x: event.clientX, y: event.clientY } : null;
        if ((event.target as HTMLElement).classList.contains('react-flow__pane')) canvasRef.current?.focus({ preventScroll: true });
      }}
      minZoom={canvasMinZoom}
      maxZoom={canvasMaxZoom}
      deleteKeyCode={canvasDeleteKeys}
      proOptions={{ hideAttribution: true }}
      colorMode={colorMode}
      className={`canvas-tool-${tool} canvas-selection`}
      data-multiple={multiple}
      panOnDrag={tool === 'hand' ? [0, 1, 2] : [1, 2]}
      selectionOnDrag={tool === 'select'}
      selectionMode={SelectionMode.Partial}
      paneClickDistance={tool === 'select' ? 4 : undefined}
      nodesDraggable={tool === 'select'}
      nodesConnectable={tool === 'select'}
      elementsSelectable={tool === 'select'}
      nodes={canvasNodes}
      nodeTypes={nodeTypes}
      onNodesChange={changeCanvasNodes}
      onNodeDragStart={startGridDrag}
      onNodeDragStop={finishCanvasDrag}
      onSelectionEnd={() => setNodes(current => current.some(node => isCanvasGroup(node) && node.selected)
        ? current.map(node => isCanvasGroup(node) && node.selected ? { ...node, selected: false } : node)
        : current)}
      edges={edges}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineComponent={ConnectionLine}
      connectionRadius={connectionRadius}
      onEdgesChange={changes => {
        const ids = new Set(changes.filter(change => change.type === 'remove').map(change => change.id));
        if (ids.size) {
          const before = getEdges(), after = before.filter(edge => !ids.has(edge.id));
          setNodes(current => pruneChangedInputMentions(current, before, after));
        }
        onEdgesChange(changes);
      }}
      isValidConnection={(connection) => withinConnectionRadius(connection) && canConnect(connection, getNodes(), getEdges())}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('application/x-momoflow-library') || event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={event => {
        event.preventDefault();
        if (!(event.target instanceof Element)) return;
        const files = [...event.dataTransfer.files];
        if (files.length) {
          if (event.target.closest('.react-flow__pane, .react-flow__node')) {
            dismissNodeMenu();
            void addMediaFiles(files, screenToFlowPosition({ x: event.clientX, y: event.clientY }), event.currentTarget);
          }
          return;
        }
        if (!event.target.classList.contains('react-flow__pane')) return;
        const node = createLibraryNode(event.dataTransfer.getData('application/x-momoflow-library'),
          screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        if (node) setNodes(current => [...current.map(item => ({ ...item, selected: false })), node]);
      }}
      onNodeContextMenu={(event, node) => {
        if (event.target instanceof Element && event.target.closest('.react-flow__node')
          && !event.target.closest('input, textarea, [contenteditable=true], [role=menu], [role=dialog], .image-edit-mode')) openNodeActions(event, node.id);
      }}
      onSelectionContextMenu={event => {
        // The multi-selection drag surface intercepts events over selected nodes.
        const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const hit = getIntersectingNodes({ ...point, width: 1, height: 1 }, true).reverse().find(n => n.selected);
        if (hit) openNodeActions(event, hit.id);
      }}
      onPaneContextMenu={event => {
        if (!(event.target instanceof Element) || !event.target.classList.contains('react-flow__pane')) return;
        event.preventDefault();
        const screen = { x: event.clientX, y: event.clientY };
        openNodeMenu({ origin: 'pane', screen, position: screenToFlowPosition(screen) });
      }}
      onConnectStart={(event, params) => { startConnectionEffects(event, params); dismissNodeMenu(); }}
      onClickConnectStart={() => { startClickConnection(); dismissNodeMenu(); }}
      onMoveStart={event => {
        if (event) { pendingZoom.current = null; setActionMenu(null); }
        dismissNodeMenu();
      }}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') || event.nativeEvent.isComposing) return;
        if (!(event.metaKey || event.ctrlKey) && (event.target as HTMLElement).closest('.image-node-reference-viewport')) return;
        if (nodes.some(node => isCanvasGroup(node) && node.resizing)) return;
        if (isArrangeShortcut({ ...event, isComposing: event.nativeEvent.isComposing })) {
          const state = canvasStore.getState();
          const blockedTarget = (event.target as HTMLElement).closest('button, select, [role="menu"], [role="dialog"], [role="listbox"], [contenteditable], .react-flow__panel');
          if (blockedTarget || apiSettingsOpen || pendingNodeMenu || state.connection.inProgress
            || state.userSelectionActive || nodes.some(node => node.dragging)
            || document.querySelector('[role="dialog"], [role="menu"]')) return;
          event.preventDefault();
          arrangeSelection();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) history.redo(); else history.undo();
        } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key.toLowerCase() === 's') setTool('select');
          if (event.key.toLowerCase() === 'h') setTool('hand');
        }
        if (event.key === 'Escape' && !event.defaultPrevented) {
          setNodes((currentNodes) => currentNodes.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          ));
          setEdges(currentEdges => currentEdges.map(edge => edge.selected ? { ...edge, selected: false } : edge));
          if ((event.target as HTMLElement).closest('.react-flow__nodesselection-rect, .canvas-selection-toolbar, .canvas-group-node')) {
            canvasRef.current?.focus({ preventScroll: true });
          }
        }
      }}
      defaultViewport={saved?.viewport}
      onMoveEnd={(_event, next) => setViewport(next)}
      fitView={!saved && initialGraph.nodes.length > 0}
    >
      <CanvasBackground onGridOriginChange={updateGridOrigin} />
      {!selectionMenu && <CanvasSelectionOutline />}
      <CanvasSelectionToolbar enabled={tool === 'select'} nodes={nodes} output={{ menu: selectionMenu, onOpen: openNodeMenu }}
        onAlign={action => setNodes(current => alignSelectedNodes(current, action))}
        onArrange={arrangeSelection} onChangeTags={color => setNodes(current => changeSelectedColorTags(current, color))}
        onGroup={() => {
          canvasRef.current?.focus({ preventScroll: true });
          const id = crypto.randomUUID();
          setNodes(current => groupSelectedNodes(current, id));
          setEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
        }}
        onToggleLock={() => setNodes(toggleSelectionLock)}
        onRun={() => requestCanvasRun()} />
      <CanvasColorTags nodes={nodes} active={activeColorTags} onActiveChange={changeActiveColorTags} setNodes={setNodes} onRestoreCanvasFocus={() => canvasRef.current?.focus({ preventScroll: true })} />
      {projectSession && <CanvasProjectHeader project={projectSession.project} projects={projectSession.projects}
        nodeCount={nodes.length} status={persistence.status}
        refresh={() => projectSession.refresh(workflow)}
        open={project => withSavedWorkflow(snapshot => projectSession.open(project, snapshot))}
        create={() => withSavedWorkflow(projectSession.create)} rename={projectSession.rename}
        remove={project => withSavedWorkflow(snapshot => projectSession.remove(project, snapshot))} />}
      {actionNode && <CanvasNodeActions key={actionNode.id} node={actionNode} nodes={nodes} edges={edges} canvas={canvasRef}
        location={actionMenu?.id === actionNode.id ? actionMenu : null} onClose={() => setActionMenu(null)}
        onError={setMediaImportError} onPaste={screen => pasteAtMenu(screenToFlowPosition(screen))} />}
      <input ref={importPicker} type="file" accept="image/*,video/mp4,.mp4" multiple hidden aria-label="导入图片或 MP4 视频"
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          const position = importPosition.current;
          const canvas = canvasRef.current;
          event.currentTarget.value = '';
          importPosition.current = null;
          if (files.length && position && canvas) void addMediaFiles(files, position, canvas);
        }} />
      {pendingNodeMenu && <AddNodeMenu key={menuGeneration} position={pendingNodeMenu.screen}
        allowedTypes={selectionMenu ? selectionConnectionChoices(nodes, selectionMenu.sourceIds, edges).map(choice => choice.itemId)
          : 'nodeId' in pendingNodeMenu ? connectionChoices(pendingNodeMenu, nodes, edges).map(choice => choice.itemId) : undefined}
        canvasActions={paneMenu ? {
          import: () => { importPosition.current = paneMenu.position; importPicker.current?.click(); },
          paste: () => { void pasteAtMenu(paneMenu.position).catch(error => setMediaImportError(
            error instanceof Error && error.name !== 'NotAllowedError' ? error.message : '无法读取剪贴板，请在画布上使用粘贴快捷键。'
          )); },
          pasteData: clipboard => pasteClipboardData(clipboard, paneMenu.position, true),
        } : undefined}
        triggerRef={dockMenu ? addTrigger : undefined}
        allowQuantity={!('direction' in pendingNodeMenu) || pendingNodeMenu.direction === 'source'}
        onSelect={addNodes}
        onClose={restoreFocus => {
          dismissNodeMenu();
          if (restoreFocus) (dockMenu ? addTrigger.current : canvasRef.current)?.focus({ preventScroll: true });
        }} />}
      {persistence.error && <Panel position="top-left" className="canvas-save-status" role="alert">
        <span>{persistence.error}</span>
        <button type="button" onClick={persistence.retry}>重试保存</button>
      </Panel>}
      {!persistence.error && mediaImportError && <Panel position="top-left" className="canvas-save-status" role="alert">
        <span>{mediaImportError}</span>
        <button type="button" onClick={() => setMediaImportError('')}>关闭</button>
      </Panel>}
      <CanvasSidebar tool={tool} onToolChange={setTool} addTrigger={addTrigger}
        gridSnap={{ enabled: gridSnap, toggle: toggleGridSnap }}
        onApiSettings={() => { dismissNodeMenu(); setApiSettingsOpen(true); }}
        menuOpen={Boolean(dockMenu)}
        onAddMenu={keyboard => {
          if (dockMenu) {
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
      <ImageInspector panelRef={setImageInspector} />
      <TextInspector />
      <CanvasNavigation pendingZoom={pendingZoom} />
      <ApiSettingsDialog open={apiSettingsOpen} onClose={() => setApiSettingsOpen(false)} onTestConnection={testApiConnection} />
    </ReactFlow></ImageInspectorElement.Provider></CanvasHistoryContext.Provider></CanvasMentionContext.Provider></CanvasColorTagContext.Provider></CanvasPortPointerContext.Provider>
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
