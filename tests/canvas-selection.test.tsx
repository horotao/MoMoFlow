import {
  addEdge, Panel, ReactFlow, ReactFlowProvider, SelectionMode,
  useEdgesState, useNodesInitialized, useNodesState, useReactFlow, useStore,
  type Edge, type FitViewOptions, type OnConnect,
} from '@xyflow/react';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasBackground } from '../src/components/CanvasBackground';
import { CanvasNavigation, canvasMaxZoom, canvasMinZoom, type ZoomTarget } from '../src/components/CanvasNavigation';
import { nodeTypes } from '../src/nodes';
import type { AppNode } from '../src/nodes/types';
import '../src/index.css';
import './canvas-selection.css';

const sampleNodes: AppNode[] = [
  { id: 'source', type: 'file', position: { x: 0, y: 0 }, data: {
    label: '市集参考图',
    asset: { id: 'market', name: '市集参考图', kind: 'image', url: '/describer-qa/market.jpg' },
  } },
  { id: 'router', type: 'router', position: { x: 626, y: 144 }, data: { label: '图像分流' } },
  { id: 'preview', type: 'preview', position: { x: 1050, y: 0 }, data: { label: '画面预览' } },
  { id: 'prompt', type: 'text', position: { x: 525, y: 435 }, data: {
    label: '画面笔记', text: '保留市集的暖色和光影，突出摊位的层次。',
  } },
];
const sampleEdges: Edge[] = [
  { id: 'source-router', source: 'source', sourceHandle: 'file', target: 'router', targetHandle: 'input' },
  { id: 'router-preview', source: 'router', sourceHandle: 'output', target: 'preview', targetHandle: 'file' },
];
const fitViewOptions = {
  padding: { top: '160px', bottom: '100px', left: '130px', right: '130px' }, maxZoom: 1,
} satisfies FitViewOptions<AppNode>;

function SelectionPreview() {
  const [nodes, setNodes, onNodesChange] = useNodesState(sampleNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(sampleEdges);
  const zoom = useStore(state => state.transform[2]);
  const canvas = useRef<HTMLDivElement>(null);
  const pendingZoom = useRef<ZoomTarget | null>(null);
  const initiallyFitted = useRef(false);
  const nodesInitialized = useNodesInitialized();
  const { fitView, viewportInitialized } = useReactFlow<AppNode>();

  useLayoutEffect(() => {
    if (!nodesInitialized || !viewportInitialized || initiallyFitted.current) return;
    initiallyFitted.current = true;
    void fitView(fitViewOptions);
  }, [fitView, nodesInitialized, viewportInitialized]);

  const hasMultipleSelected = nodes.filter(node => node.selected).length > 1;
  const clearSelection = () => {
    setNodes(current => current.map(node => node.selected ? { ...node, selected: false } : node));
    setEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
    canvas.current?.focus({ preventScroll: true });
  };
  const onConnect: OnConnect = connection => setEdges(current => addEdge(connection, current));

  return <ReactFlow<AppNode, Edge> ref={canvas} tabIndex={0}
    className="canvas-selection canvas-tool-select"
    data-multiple={hasMultipleSelected}
    style={{ '--canvas-zoom': zoom } as CSSProperties}
    colorMode="dark" proOptions={{ hideAttribution: true }}
    nodes={nodes} edges={edges} nodeTypes={nodeTypes}
    onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
    minZoom={canvasMinZoom} maxZoom={canvasMaxZoom}
    selectionOnDrag selectionMode={SelectionMode.Partial} paneClickDistance={4} panOnDrag={[1, 2]}
    onPointerDownCapture={event => {
      if ((event.target as Element).classList.contains('react-flow__pane')) {
        canvas.current?.focus({ preventScroll: true });
      }
    }}
    onKeyDown={event => {
      if (event.key === 'Escape' && !(event.target as Element).closest(
        'input, textarea, [contenteditable], [role="menu"], [role="listbox"]',
      )) clearSelection();
    }}>
    <CanvasBackground />
    <Panel position="top-left" className="selection-preview-heading">
      <div>MoMoFlow <span>隔离预览</span></div>
      <h1>画布框选</h1>
      <p>从空白处拖动，碰到的节点会被选中。松手后可拖动整组，按 Esc 清除选择。</p>
    </Panel>
    <CanvasNavigation pendingZoom={pendingZoom} />
  </ReactFlow>;
}

createRoot(document.getElementById('root')!).render(<ReactFlowProvider><SelectionPreview /></ReactFlowProvider>);
