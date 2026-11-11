import {
  addEdge, Panel, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState,
  useNodesInitialized, useReactFlow, type Edge, type FitViewOptions, type OnConnect,
} from '@xyflow/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasNavigation, canvasMinZoom, canvasMaxZoom, type ZoomTarget } from '../src/components/CanvasNavigation';
import { CanvasSidebar, type CanvasTool } from '../src/components/CanvasSidebar';
import { CanvasBackground } from '../src/components/CanvasBackground';
import { ConnectionMenu, type NodeMenuChoice } from '../src/components/ConnectionMenu';
import { createLibraryNode, items } from '../src/components/libraryCatalog';
import { TaskQueue, type QueueTask } from '../src/components/TaskQueue';
import { edgeTypes } from '../src/edges';
import { nodeTypes } from '../src/nodes';
import { defaultPaletteColors } from '../src/nodes/colorPalette';
import type { AppNode, FileAsset } from '../src/nodes/types';
import '../src/index.css';
import './canvas-navigation.css';

const fitOptions = {
  padding: { top: '72px', right: '32px', bottom: '232px', left: '76px' }, maxZoom: 1,
} satisfies FitViewOptions<AppNode>;
const asset: FileAsset = {
  id: 'sample-market', name: '市集参考图', kind: 'image', url: '/describer-qa/market.jpg',
};
const sampleNodes: AppNode[] = [
  { id: 'source', type: 'file', position: { x: 0, y: 0 }, data: { label: '市集 · 原图', asset } },
  { id: 'router', type: 'router', position: { x: 680, y: 62 }, data: { label: '图像分流' } },
  { id: 'preview', type: 'preview', position: { x: 1160, y: 0 }, data: { label: '市集 · 预览' } },
  { id: 'palette', type: 'color-palette', position: { x: 1160, y: 640 }, data: { colors: defaultPaletteColors() } },
  { id: 'prompt', type: 'text', position: { x: 390, y: 610 }, data: {
    label: '画面笔记', text: '保留市集的暖色和光影，突出摊位的层次。',
  } },
];
const sampleEdges: Edge[] = [
  { id: 'source-router', source: 'source', sourceHandle: 'file', target: 'router', targetHandle: 'input' },
  { id: 'router-preview', source: 'router', sourceHandle: 'output', target: 'preview', targetHandle: 'file' },
];
const previewNodeIds = new Set(['file', 'text', 'preview', 'router', 'color-palette', 'crop', 'levels', 'blur']);
const dockChoices: NodeMenuChoice[] = items.filter(item => previewNodeIds.has(item.id))
  .map(item => ({ id: item.id, itemId: item.id }));
const sampleTasks: QueueTask[] = [
  { id: 'sample-image', label: 'GPT Image 2.5', state: 'running', progress: 65 },
  { id: 'sample-banana', label: 'Nano Banana', state: 'running', progress: 45 },
  { id: 'sample-description', label: '图像描述', state: 'done', progress: 100 },
];

function PreviewTaskQueue() {
  const [expanded, setExpanded] = useState(true);
  const [tasks, setTasks] = useState(sampleTasks);

  return <div className="canvas-task-queue nodrag nopan nowheel">
    <TaskQueue tasks={tasks} expanded={expanded} onExpandedChange={setExpanded}
      onClear={() => setTasks(current => current.filter(task => task.state === 'running' || task.state === 'queued'))}
      onCancel={id => setTasks(current => current.map(task => task.id === id ? { ...task, state: 'cancelled' } : task))}
      onRetry={id => setTasks(current => current.map(task => task.id === id ? { ...task, state: 'running', progress: 0 } : task))}
      onRemove={id => setTasks(current => current.filter(task => task.id !== id))} />
  </div>;
}

function Preview() {
  const [nodes, setNodes, onNodesChange] = useNodesState(sampleNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(sampleEdges);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [dockMenu, setDockMenu] = useState<{ x: number; y: number; keyboard: boolean } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const pendingZoom = useRef<ZoomTarget | null>(null);
  const initiallyFitted = useRef(false);
  const nodesInitialized = useNodesInitialized();
  const { fitView, screenToFlowPosition, viewportInitialized } = useReactFlow<AppNode>();

  useLayoutEffect(() => {
    if (!nodesInitialized || !viewportInitialized || initiallyFitted.current) return;
    initiallyFitted.current = true;
    void fitView(fitOptions);
  }, [fitView, nodesInitialized, viewportInitialized]);

  const onConnect: OnConnect = connection => setEdges(current => addEdge(connection, current));
  const chooseNode = ({ itemId }: NodeMenuChoice) => {
    const bounds = canvas.current?.getBoundingClientRect();
    if (!bounds) return;
    const position = screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    const node = createLibraryNode(itemId, position);
    if (node) setNodes(current => [...current.map(item => ({ ...item, selected: false })), node]);
    setDockMenu(null);
    canvas.current?.focus({ preventScroll: true });
  };

  return <main className="navigation-preview">
    <ReactFlow<AppNode, Edge> ref={canvas} tabIndex={0} className={`canvas-tool-${tool}`}
      nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
      panOnDrag={tool === 'hand' ? [0, 1, 2] : [1, 2]} selectionOnDrag={tool === 'select'}
      nodesDraggable={tool === 'select'} nodesConnectable={tool === 'select'} elementsSelectable={tool === 'select'}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing
          || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
        if (event.key.toLowerCase() === 'v') setTool('select');
        if (event.key.toLowerCase() === 'h') setTool('hand');
      }}
      onMoveStart={event => { if (event) pendingZoom.current = null; }}
      minZoom={canvasMinZoom} maxZoom={canvasMaxZoom} colorMode="dark"
      proOptions={{ hideAttribution: true }}>
      <CanvasBackground />
      <Panel position="top-left" className="navigation-preview-heading">
        <div className="navigation-preview-brand">MoMoFlow <span>隔离预览</span></div>
        <h1>画布导航</h1>
      </Panel>
      <CanvasSidebar tool={tool} onToolChange={setTool} addTrigger={addTrigger} menuOpen={Boolean(dockMenu)}
        onAddMenu={keyboard => {
          const anchor = addTrigger.current?.getBoundingClientRect();
          if (anchor) setDockMenu(current => current ? null : { x: anchor.right + 12, y: anchor.top - 90, keyboard });
        }} />
      {dockMenu && <ConnectionMenu screen={dockMenu} trigger={addTrigger} choices={dockChoices}
        animateEntrance instantEntrance={dockMenu.keyboard} onChoose={chooseNode}
        onDismiss={() => {
          if (document.activeElement?.closest('.node-add-menu')) addTrigger.current?.focus({ preventScroll: true });
          setDockMenu(null);
        }} />}
      <CanvasNavigation pendingZoom={pendingZoom} />
      <PreviewTaskQueue />
    </ReactFlow>
  </main>;
}

createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Preview /></ReactFlowProvider>);
