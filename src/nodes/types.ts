import type { Node, BuiltInNode } from '@xyflow/react';
import type { JSONContent } from '@tiptap/core';

export type PositionLoggerNode = Node<{ label: string }, 'position-logger'>;
export type TextDisplayMode = 'source-value' | 'value' | 'source';
export type TextNode = Node<{ text: string; label?: string; locked?: boolean; content?: JSONContent; variableCount?: number; displayMode?: TextDisplayMode }, 'text'>;
export type FileAsset = { id: string; name: string; url: string; kind: 'image' | 'video' | 'audio' | '3d'; size?: number; width?: number; height?: number };
export type FileNode = Node<{ label?: string; locked?: boolean; asset?: FileAsset; assets?: FileAsset[]; activeAssetId?: string; viewMode?: 'single' | 'all'; orderBy?: 'date' | 'name' }, 'file'>;
export type ImageDescriberNode = Node<{ label?: string; locked?: boolean; text: string; model: string; instructions: string; imageInputs: number; exposed?: ('model' | 'instructions')[] }, 'image-describer'>;
export type ModelInputNode = Node<{ label?: string; locked?: boolean; model: string; options?: string[] }, 'model-input'>;
export type AppNode = ImageDescriberNode | ModelInputNode | BuiltInNode | PositionLoggerNode | TextNode | FileNode;

export const isDescriberNode = (node: AppNode): node is ImageDescriberNode => node.type === 'image-describer' && 'imageInputs' in node.data;

export const isNodeLocked = (node: AppNode | undefined): boolean => Boolean(node && 'locked' in node.data && node.data.locked);
