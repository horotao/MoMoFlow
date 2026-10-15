import { Position, type NodeTypes } from '@xyflow/react';

import { PositionLoggerNode } from './PositionLoggerNode';
import { TextNode } from './TextNode';
import type { AppNode } from './types';
import { defaultTextNodeText } from './defaults';

export const initialNodes: AppNode[] = [
  {
    id: 'text-1',
    type: 'text',
    position: { x: 320, y: 100 },
    data: { text: defaultTextNodeText },
  },
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
  text: TextNode,
  'position-logger': PositionLoggerNode,
  // Add any of your custom nodes here!
} satisfies NodeTypes;
