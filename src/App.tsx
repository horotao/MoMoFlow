import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Position,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type OnConnectEnd,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { initialNodes, nodeTypes } from './nodes';
import type { AppNode } from './nodes/types';
import { initialEdges, edgeTypes } from './edges';

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow<AppNode>();
  const nextNodeNumber = useRef(1);
  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((edges) => addEdge(connection, edges)),
    [setEdges]
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

      const id = `node-${crypto.randomUUID()}`;
      const fromSource = fromHandle.type === 'source';
      const newNode: AppNode = {
        id,
        type: 'default',
        position: screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }),
        // Anchor the connecting handle at the release point in either direction.
        origin: [fromSource ? 0 : 1, 0.5],
        data: { label: `Node ${nextNodeNumber.current++}` },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
      };

      setNodes((currentNodes) => [...currentNodes, newNode]);
      setEdges((currentEdges) => addEdge({
        id: `edge-${crypto.randomUUID()}`,
        source: fromSource ? fromNode.id : id,
        target: fromSource ? id : fromNode.id,
        sourceHandle: fromSource ? fromHandle.id : null,
        targetHandle: fromSource ? null : fromHandle.id,
      }, currentEdges));
    },
    [screenToFlowPosition, setNodes, setEdges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      edges={edges}
      edgeTypes={edgeTypes}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      fitView
    >
      <Background />
      <MiniMap />
      <Controls />
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
