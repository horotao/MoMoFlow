import type { Node, BuiltInNode } from '@xyflow/react';

export type PositionLoggerNode = Node<{ label: string }, 'position-logger'>;
export type TextNode = Node<{ text: string }, 'text'>;
export type AppNode = BuiltInNode | PositionLoggerNode | TextNode;
