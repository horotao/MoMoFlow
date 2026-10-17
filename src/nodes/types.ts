import type { Node, BuiltInNode } from '@xyflow/react';
import type { JSONContent } from '@tiptap/core';

export type PositionLoggerNode = Node<{ label: string }, 'position-logger'>;
export type TextDisplayMode = 'source-value' | 'value' | 'source';
export type TextNode = Node<{ text: string; label?: string; locked?: boolean; content?: JSONContent; variableCount?: number; displayMode?: TextDisplayMode }, 'text'>;
export type FileAsset = { id: string; name: string; url: string; kind: 'image' | 'video' | 'audio' | '3d'; size?: number; width?: number; height?: number };
export type FileNode = Node<{ label?: string; locked?: boolean; asset?: FileAsset; assets?: FileAsset[]; activeAssetId?: string; viewMode?: 'single' | 'all'; orderBy?: 'date' | 'name' }, 'file'>;
export type AppNode = BuiltInNode | PositionLoggerNode | TextNode | FileNode;
