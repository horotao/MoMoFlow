import type { Node, BuiltInNode } from '@xyflow/react';
import type { JSONContent } from '@tiptap/core';

export type PositionLoggerNode = Node<{ label: string }, 'position-logger'>;
export type TextDisplayMode = 'source-value' | 'value' | 'source';
export type TextNode = Node<{ text: string; content?: JSONContent; variableCount?: number; displayMode?: TextDisplayMode }, 'text'>;
export type AppNode = BuiltInNode | PositionLoggerNode | TextNode;
