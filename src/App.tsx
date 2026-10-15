import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type OnConnectEnd,
} from '@xyflow/react';

import { DevTools } from './components/DevTools';
import { initialNodes, nodeTypes } from './nodes';
import type { AppNode } from './nodes/types';
import { isTextNode, textVariableCount, variableHandleId, variableIndex } from './nodes/textVariables';
import { defaultTextNodeText } from './nodes/defaults';
import { initialEdges, edgeTypes } from './edges';

function Flow() {
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode === 'dark');
  }, [colorMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow<AppNode>();
  const canvasRef = useRef<HTMLDivElement>(null);
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
      nodes={nodes.map((node) => isTextNode(node) ? {
        ...node,
        style: { ...node.style, height: Math.max(405, 139 + (textVariableCount(node, edges) - 1) * 60) },
      } : node)}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      edges={edges.map((edge) => nodes.some((node) => isTextNode(node) && (node.id === edge.source || node.id === edge.target))
        ? { ...edge, className: 'text-variable-edge' } : edge)}
      edgeTypes={edgeTypes}
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
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          setNodes((currentNodes) => currentNodes.map((node) =>
            isTextNode(node) && node.selected ? { ...node, selected: false } : node,
          ));
        }
      }}
      fitView
    >
      <Background />
      <DevTools position="top-left" />
      <MiniMap />
      <Controls>
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
