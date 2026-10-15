import { Position, type NodeTypes } from '@xyflow/react';

import { PositionLoggerNode } from './PositionLoggerNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [
  {
    id: 'a',
    type: 'input',
    position: { x: 0, y: 0 },
    sourcePosition: Position.Right,
    data: { label: 'wire' },
  },
  {
    id: 'b',
    type: 'position-logger',
    position: { x: -100, y: 100 },
    data: { label: 'drag me!' },
  },
  {
    id: 'c',
    position: { x: 100, y: 100 },
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
    data: { label: 'your ideas' },
  },
  {
    id: 'd',
    type: 'output',
    targetPosition: Position.Left,
    position: { x: 0, y: 200 },
    data: { label: 'with React Flow' },
  },
];

export const nodeTypes = {
  'position-logger': PositionLoggerNode,
  // Add any of your custom nodes here!
} satisfies NodeTypes;
