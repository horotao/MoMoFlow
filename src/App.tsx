import { useCallback, useEffect, useRef, useState } from 'react';
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

import { CanvasDock, type CanvasTool } from './components/CanvasDock';
import { useCanvasHistory } from './components/useCanvasHistory';
import { DevTools } from './components/DevTools';
import { initialNodes, nodeTypes } from './nodes';
import type { AppNode } from './nodes/types';
import { isTextNode, textVariableCount, variableHandleId, variableIndex } from './nodes/textVariables';
import { imagesFromDrop, isFileNode } from './nodes/fileAsset';
import { fileOutputKind, filePortColors, isFileAsset } from './nodes/fileCollection';
import { cloneTextNode } from './nodes/cloneTextNode';
import { defaultTextNodeText } from './nodes/defaults';
import { initialEdges, edgeTypes } from './edges';
import { ConnectionLine } from './edges/ConnectionLine';
import { curveOptions } from './edges/curve';

const defaultEdgeOptions = { type: 'default', pathOptions: curveOptions };

function Flow() {
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode === 'dark');
  }, [colorMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow<AppNode>();
  const [tool, setTool] = useState<CanvasTool>('select');
  const [importError, setImportError] = useState('');
  const restore = useCallback((snapshot: { nodes: AppNode[]; edges: typeof edges }) => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pasteNode = (event: ClipboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
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
      setEdges((edges) => addEdge(connection, edges));
      setNodes((currentNodes) => currentNodes.map((node) =>
        node.id === connection.target && isTextNode(node)
          ? { ...node, data: { ...node.data, variableCount: Math.max(node.data.variableCount ?? 0, variableIndex(connection.targetHandle) + 2) } }
          : node,
      ));
    },
    [setEdges, setNodes]
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

      const id = `text-${crypto.randomUUID()}`;
      const fromSource = fromHandle.type === 'source';
      const newNode: AppNode = {
        id,
        type: 'text',
        position: screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }),
        // Anchor the connecting handle at the release point in either direction.
        origin: [fromSource ? 0 : 1, 91 / 405],
        data: { text: defaultTextNodeText, variableCount: fromSource ? 2 : 0 },
      };

      setNodes((currentNodes) => [...currentNodes.map((node) =>
        !fromSource && node.id === fromNode.id && isTextNode(node)
          ? { ...node, data: { ...node.data, variableCount: Math.max(node.data.variableCount ?? 0, variableIndex(fromHandle.id) + 2) } }
          : node,
      ), newNode]);
      setEdges((currentEdges) => addEdge({
        id: `edge-${crypto.randomUUID()}`,
        source: fromSource ? fromNode.id : id,
        target: fromSource ? id : fromNode.id,
        sourceHandle: fromSource ? fromHandle.id : null,
        targetHandle: fromSource ? variableHandleId(0) : fromHandle.id,
      }, currentEdges));
    },
    [screenToFlowPosition, setNodes, setEdges],
  );

  return (
    <ReactFlow
      ref={canvasRef}
      colorMode={colorMode}
      className={`canvas-tool-${tool}`}
      panOnDrag={tool === 'hand' ? true : [1, 2]}
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
        style: { ...node.style, height: Math.max(405, 139 + (textVariableCount(node, edges) - 1) * 60) },
      } : node)}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      edges={edges.map((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const fileSource = source && isFileNode(source) ? source : undefined;
        const textConnection = nodes.some((node) => isTextNode(node) && (node.id === edge.source || node.id === edge.target));
        return fileSource || textConnection ? {
          ...edge, className: [edge.className, 'text-variable-edge'].filter(Boolean).join(' '),
          style: { ...edge.style, ...(fileSource ? { stroke: filePortColors[fileOutputKind(fileSource.data)] } : {}) },
        } : edge;
      })}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineComponent={ConnectionLine}
      onEdgesChange={onEdgesChange}
      isValidConnection={(connection) => {
        const currentEdges = getEdges();
        if (connection.source === connection.target) return false;
        const target = getNodes().find((node) => node.id === connection.target);
        if (target?.type === 'text' && currentEdges.some((edge) => edge.target === connection.target
          && variableIndex(edge.targetHandle) === variableIndex(connection.targetHandle))) return false;
        const pending = [connection.target];
        const visited = new Set<string>();
        while (pending.length) {
          const id = pending.pop()!;
          if (id === connection.source) return false;
          if (visited.has(id)) continue;
          visited.add(id);
          pending.push(...currentEdges.filter((edge) => edge.source === id).map((edge) => edge.target));
        }
        return true;
      }}
      onDragOver={(event) => {
        const types = event.dataTransfer.types;
        const internal = types.includes('application/x-momoflow-asset');
        const external = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html');
        if (!internal && !external) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = (event.target as HTMLElement).classList.contains('react-flow__pane')
          ? internal ? 'move' : 'copy' : 'none';
      }}
      onDrop={(event) => {
        const transfer = event.dataTransfer;
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
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') || event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) history.redo(); else history.undo();
        } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key.toLowerCase() === 'v') setTool('select');
          if (event.key.toLowerCase() === 'h') setTool('hand');
        }
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          setNodes((currentNodes) => currentNodes.map((node) =>
            (isTextNode(node) || node.type === 'file') && node.selected ? { ...node, selected: false } : node,
          ));
        }
      }}
      fitView
    >
      <Background />
      {importError && <Panel position="top-center" className="canvas-import-error" role="alert">
        <span>{importError}</span><button type="button" aria-label="Dismiss import error" onClick={() => setImportError('')}>×</button>
      </Panel>}
      <CanvasDock tool={tool} onToolChange={setTool} colorMode={colorMode} {...history} />
      <DevTools position="top-left" />
      <MiniMap />
      <Controls showInteractive={false}>
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
    </ReactFlow>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
