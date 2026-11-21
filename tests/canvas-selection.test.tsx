import { canvasImage } from './fixtures/canvasImage';
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
  canvasImage('source', 0, 0), canvasImage('router', 680, 62), canvasImage('preview', 1160, 0),
  canvasImage('palette', 1160, 640), canvasImage('prompt', 390, 610),
];
const sampleEdges: Edge[] = [
  { id: 'source-router', source: 'source', sourceHandle: 'file', target: 'router', targetHandle: 'variable-1' },
  { id: 'router-preview', source: 'router', sourceHandle: null, target: 'preview', targetHandle: 'variable-1' },
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
