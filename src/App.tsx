import { CanvasColorTags } from './components/CanvasColorTags';
import './components/canvas-right-panels.css';
import { CanvasColorTagContext } from './components/CanvasColorTagContext';
import { changeColorTags, nodeColorTags, type ColorTag } from './nodes/colorTags';
import { CanvasMentionContext } from './nodes/CanvasMentionContext';
import { editPromptMentions, pruneDisconnectedMentions } from './nodes/promptMentions';
import { animateMentionWire } from './edges/mentionWireAnimation';
import { preventCanvasImageDrag, withCanvasImageDrag } from './components/canvasImageDrag';
import { ImageInspector } from './components/image-prompt-node/ImageInspector';
import { TextInspector } from './components/image-prompt-node/TextInspector';
import { restoreSunburstData } from './nodes/sunburstClipboard';
import { CanvasNavigation, canvasMinZoom, canvasMaxZoom, type ZoomTarget } from './components/CanvasNavigation';
import { CanvasSidebar, type CanvasTool } from './components/CanvasSidebar';
import { arrangeSelectedNodes, isArrangeShortcut } from './components/canvasLayout';
import { CanvasBackground } from './components/CanvasBackground';
import { canvasGridOrigin, readGridSnap, saveGridSnap, snapDragChanges, type GridDragAnchor } from './components/canvasGrid';
import { ApiSettingsDialog } from './components/ApiSettingsDialog';
import { testApiConnection } from './components/apiSettings';
import { AddNodeMenu, type AddNodeRequest } from './components/add-node-menu/AddNodeMenu';
import { canConnect, withoutReplacedInput } from './nodes/connectionRules';
import { connectionChoices, choiceConnection, type PendingConnection } from './nodes/connectionRecommendations';
import { createLibraryNode } from './components/libraryCatalog';
import { createImportedCanvasImage, readCanvasImage } from './nodes/importCanvasImage';
import { assetResources } from './nodes/assetResources';
import { canvasImageSize } from './nodes/canvasImageGeometry';
import { connectImageReferenceRatio } from './nodes/imageReferenceRatio';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { isNodeLocked, type AppNode } from './nodes/types';
import { initialEdges, edgeTypes } from './edges';
import { ConnectionLine } from './edges/ConnectionLine';
import { useConnectionGesture } from './edges/useConnectionGesture';

import { WorkflowStorage, type Workflow } from './persistence/workflowStorage';
import { migrateLegacyImageGraph } from './persistence/legacyImageMigration';
import { useWorkflowPersistence } from './persistence/useWorkflowPersistence';
import { ProjectLibrary, type CanvasProject } from './persistence/projectLibrary';
import { CanvasProjectHeader } from './components/CanvasProjectHeader';

const defaultEdgeOptions = { type: 'default' };
type PendingNodeMenu = PendingConnection | (Pick<PendingConnection, 'screen' | 'position'> & { origin?: 'dock'; keyboard?: boolean });

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
  const [imageImportError, setImageImportError] = useState('');
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
  const colorTagContext = useMemo(() => ({
    nodes: new Map(nodes.map(node => [node.id, { tags: nodeColorTags(node), locked: isNodeLocked(node) }])),
    active: activeColorTags,
    zoom: viewport.zoom,
    change: (id: string, color?: ColorTag) => setNodes(nodes => changeColorTags(nodes, [id], color)),
  }), [nodes, activeColorTags, viewport.zoom, setNodes]);
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
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow<AppNode>();
  const { start: startConnectionEffects, cancel: clearConnectionEffects, cancelled: connectionCancelled, connectionRadius,
    startClick: startClickConnection, end: endConnectionGesture, withinRadius: withinConnectionRadius } = useConnectionGesture(40, true);
  const [tool, setTool] = useState<CanvasTool>('select');
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
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges, clearConnectionEffects]);
  const history = useCanvasHistory(nodes, edges, restore);
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
    const anchor = gridDragAnchor.current;
    onNodesChange(anchor ? snapDragChanges(changes, anchor, gridOrigin.current) : changes);
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
    const updateZoom = (zoom: number) => {
      canvas.style.setProperty('--canvas-zoom', String(zoom));
      const percent = Math.round(zoom * 100);
      const heading = percent <= 7 ? 'hidden' : percent <= 14 ? 'icon' : 'labels';
      if (canvas.dataset.nodeHeading !== heading) canvas.dataset.nodeHeading = heading;
    };
    updateZoom(canvasStore.getState().transform[2]);
    return canvasStore.subscribe((current, previous) => {
      const zoom = current.transform[2];
      if (zoom !== previous.transform[2]) updateZoom(zoom);
    });
  }, [canvasStore]);
  const pendingZoom = useRef<ZoomTarget | null>(null);
  useEffect(() => {
    const pasteNode = (event: ClipboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      try {
        const saved = JSON.parse(event.clipboardData?.getData('text/plain') ?? '');

        if (saved.format === 'momoflow-sunburst-node' && saved.node?.type === 'sunburst'
          && Number.isFinite(saved.node.position?.x) && Number.isFinite(saved.node.position?.y)) {
          const data = restoreSunburstData(saved.node.data);
          if (!data) return;
          event.preventDefault();
          const { nodes: pasted } = migrateLegacyImageGraph([{
            id: crypto.randomUUID(), type: 'sunburst', position: { x: saved.node.position.x + 40, y: saved.node.position.y + 40 },
            origin: saved.node.origin?.[0] === 0.5 && saved.node.origin?.[1] === 0 ? [0.5, 0] : undefined, data,
          }], []);
          setNodes(current => [...current.map(node => ({ ...node, selected: false })), ...pasted.map(node => ({ ...node, selected: true }))]);
          return;
        }

      } catch { /* Ordinary clipboard text belongs to the text editor. */ }
    };
    window.addEventListener('paste', pasteNode);
    return () => window.removeEventListener('paste', pasteNode);
  }, [setNodes]);
  const onConnect: OnConnect = useCallback(connection => {
    if (connectionCancelled.current || !withinConnectionRadius(connection) || !canConnect(connection, getNodes(), getEdges())) return;
    const previous = getEdges();
    const next = addEdge(connection, withoutReplacedInput(connection, previous));
    setNodes(current => connectImageReferenceRatio(current, previous, next, connection.target));
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
      if (connectionChoices(pending, getNodes()).length) openNodeMenu(pending);
    },
    [screenToFlowPosition, openNodeMenu, connectionCancelled, endConnectionGesture, getNodes],
  );

  function addImages({ type, quantity }: AddNodeRequest) {
    if (!pendingNodeMenu) return;
    const pending = 'nodeId' in pendingNodeMenu ? pendingNodeMenu : null;
    const currentNodes = getNodes(), currentEdges = getEdges();
    const choice = pending && connectionChoices(pending, currentNodes).find(item => item.itemId === type);
    if (pending && !choice) return;
    const created: AppNode[] = [], connections: Edge[] = [];
    for (let i = 0; i < quantity; i++) {
      const node = createLibraryNode(type, {
        x: pendingNodeMenu.position.x - (choice?.portX ?? 0) + (i % 4) * 512,
        y: pendingNodeMenu.position.y - (choice?.portY ?? 0) + Math.floor(i / 4) * 512,
      });
      if (!node) return;
      if (pending && choice) {
        const link = choiceConnection(pending, choice, node.id);
        if (!canConnect(link, [...currentNodes, ...created, node], [...currentEdges, ...connections])) return;
        connections.push({ ...link, id: crypto.randomUUID() });
      }
      created.push(node);
    }
    const nextEdges = connections.length ? [...withoutReplacedInput(connections[0], currentEdges), ...connections] : currentEdges;
    setNodes(current => {
      let next = [...current.map(node => ({ ...node, selected: false })), ...created];
      for (const connection of connections) next = connectImageReferenceRatio(next, currentEdges, nextEdges, connection.target);
      return next;
    });
    if (connections.length) setEdges(nextEdges);
  }

  async function addImageFiles(files: File[], position: XYPosition, canvas: HTMLDivElement) {
    setImageImportError('');
    const settled = await Promise.allSettled(files.map(readCanvasImage));
    const assets = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (canvasRef.current !== canvas || canvas.hasAttribute('inert')) {
      assetResources.discard(assets.map(asset => asset.url));
      return;
    }
    const failures = files.length - assets.length;
    if (failures) {
      const only = settled.length === 1 ? settled[0] : undefined;
      setImageImportError(only?.status === 'rejected' && only.reason instanceof Error
        ? only.reason.message : `${failures} 个文件无法导入。请选择浏览器支持的图片文件。`);
    }
    if (!assets.length) return;
    let x = position.x;
    const imported = assets.map(asset => {
      const item = createImportedCanvasImage(asset, { x, y: position.y });
      x += canvasImageSize('auto', asset).width + 64;
      return item;
    });
    setNodes(current => [...current.map(node => ({ ...node, selected: false })), ...imported]);
  }

  const canvasNodes = useMemo(() => nodes.map(node => {
    const editable = !isNodeLocked(node) && tool === 'select';
    return withCanvasImageDrag({ ...node, draggable: editable, deletable: !isNodeLocked(node),
      connectable: editable, className: 'canvas-image-node' });
  }), [nodes, tool]);

  return (
    <CanvasColorTagContext.Provider value={colorTagContext}><CanvasMentionContext.Provider value={(id, edit, sourceId) => {
      const result = editPromptMentions(id, edit, getNodes(), getEdges(), sourceId, crypto.randomUUID());
      if (!result) return false;
      result.addedEdges.forEach(edge => animateMentionWire(edge.id));
      setNodes(result.nodes); setEdges(result.edges);
      return true;
    }}><CanvasHistoryContext.Provider value={history}><ReactFlow
      ref={canvasRef}
      tabIndex={0}
      onDragStartCapture={preventCanvasImageDrag}
      onPointerDownCapture={event => {
        if ((event.target as HTMLElement).classList.contains('react-flow__pane')) canvasRef.current?.focus({ preventScroll: true });
      }}
      minZoom={canvasMinZoom}
      maxZoom={canvasMaxZoom}
      proOptions={{ hideAttribution: true }}
      colorMode={colorMode}
      className={`canvas-tool-${tool} canvas-selection`}
      data-multiple={nodes.filter(node => node.selected).length > 1}
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
      onNodeDragStop={endGridDrag}
      edges={edges}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineComponent={ConnectionLine}
      connectionRadius={connectionRadius}
      onEdgesChange={changes => {
        const ids = new Set(changes.filter(change => change.type === 'remove').map(change => change.id));
        if (ids.size) {
          const removed = getEdges().filter(edge => ids.has(edge.id));
          setNodes(current => pruneDisconnectedMentions(current, removed));
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
            void addImageFiles(files, screenToFlowPosition({ x: event.clientX, y: event.clientY }), event.currentTarget);
          }
          return;
        }
        if (!event.target.classList.contains('react-flow__pane')) return;
        const node = createLibraryNode(event.dataTransfer.getData('application/x-momoflow-library'),
          screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        if (node) setNodes(current => [...current.map(item => ({ ...item, selected: false })), node]);
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
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') || event.nativeEvent.isComposing) return;
        if (!(event.metaKey || event.ctrlKey) && (event.target as HTMLElement).closest('.image-node-reference-viewport')) return;
        if (isArrangeShortcut({ ...event, isComposing: event.nativeEvent.isComposing })) {
          const state = canvasStore.getState();
          const blockedTarget = (event.target as HTMLElement).closest('button, select, [role="menu"], [role="dialog"], [role="listbox"], [contenteditable], .react-flow__panel');
          if (blockedTarget || apiSettingsOpen || pendingNodeMenu || state.connection.inProgress
            || state.userSelectionActive || nodes.some(node => node.dragging)
            || document.querySelector('[role="dialog"], [role="menu"]')) return;
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
      fitView={!saved && initialGraph.nodes.length > 0}
    >
      <CanvasBackground onGridOriginChange={updateGridOrigin} />
      <CanvasColorTags nodes={nodes} active={activeColorTags} onActiveChange={changeActiveColorTags} setNodes={setNodes} onRestoreCanvasFocus={() => canvasRef.current?.focus({ preventScroll: true })} />
      {projectSession && <CanvasProjectHeader project={projectSession.project} projects={projectSession.projects}
        nodeCount={nodes.length} status={persistence.status}
        refresh={() => projectSession.refresh(workflow)}
        open={project => withSavedWorkflow(snapshot => projectSession.open(project, snapshot))}
        create={() => withSavedWorkflow(projectSession.create)} rename={projectSession.rename}
        remove={project => withSavedWorkflow(snapshot => projectSession.remove(project, snapshot))} />}
      {pendingNodeMenu && <AddNodeMenu key={menuGeneration} position={pendingNodeMenu.screen}
        allowedTypes={'nodeId' in pendingNodeMenu ? connectionChoices(pendingNodeMenu, nodes).map(choice => choice.itemId as 'image' | 'text') : undefined}
        triggerRef={'origin' in pendingNodeMenu ? addTrigger : undefined}
        allowQuantity={!('direction' in pendingNodeMenu) || pendingNodeMenu.direction === 'source'}
        onSelect={addImages}
        onClose={restoreFocus => {
          dismissNodeMenu();
          if (restoreFocus) ('origin' in pendingNodeMenu ? addTrigger.current : canvasRef.current)?.focus({ preventScroll: true });
        }} />}
      {persistence.error && <Panel position="top-left" className="canvas-save-status" role="alert">
        <span>{persistence.error}</span>
        <button type="button" onClick={persistence.retry}>重试保存</button>
      </Panel>}
      {!persistence.error && imageImportError && <Panel position="top-left" className="canvas-save-status" role="alert">
        <span>{imageImportError}</span>
        <button type="button" onClick={() => setImageImportError('')}>关闭</button>
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
      <ImageInspector />
      <TextInspector />
      <CanvasNavigation pendingZoom={pendingZoom} />
      <ApiSettingsDialog open={apiSettingsOpen} onClose={() => setApiSettingsOpen(false)} onTestConnection={testApiConnection} />
    </ReactFlow></CanvasHistoryContext.Provider></CanvasMentionContext.Provider></CanvasColorTagContext.Provider>
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
