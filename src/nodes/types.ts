import type { AnnotationHistory, InteractiveEditData } from './interactiveEdit';
import type { GenerationRecord, OutputPolicy } from './executionGraph';
import type { SeedreamSettings } from './seedream';
import type { NanoBananaSettings } from './nanoBanana';
import type { Node, BuiltInNode } from '@xyflow/react';
import type { SunburstParameter, SunburstProvider, SunburstSettings } from './sunburst';
import type { JSONContent } from '@tiptap/core';

export type TextDisplayMode = 'source-value' | 'value' | 'source';
export type TextNode = Node<{ text: string; label?: string; locked?: boolean; content?: JSONContent; variableCount?: number; displayMode?: TextDisplayMode }, 'text'>;
export type FileAsset = {
  id: string; name: string; url: string; kind: 'image' | 'video' | 'audio' | '3d'; size?: number; width?: number; height?: number;
  // Preserve gray-mask semantics through pass-through nodes and saved snapshots.
  maskMode?: 'luminance';
  contentHash?: string; generation?: GenerationRecord;
};
export type FileNode = Node<{ label?: string; locked?: boolean; asset?: FileAsset; assets?: FileAsset[]; activeAssetId?: string; viewMode?: 'single' | 'all'; orderBy?: 'date' | 'name'; annotations?: AnnotationHistory[] }, 'file'>;
export const isFileNode = (node: AppNode | undefined): node is FileNode => node?.type === 'file';
type ImageResults = { results?: FileAsset[]; activeResultId?: string; orderBy?: 'date' | 'name'; annotations?: AnnotationHistory[] };
export type SunburstNode = Node<SunburstSettings & OutputPolicy & ImageResults & { provider?: SunburstProvider; variant?: 'Sunburst' | 'Flare'; label?: string; locked?: boolean; imageInputs: number; exposed?: SunburstParameter[] }, 'sunburst'>;
export const isSunburstNode = (node: AppNode): node is SunburstNode => node.type === 'sunburst';
export type NanoBananaNode = Node<NanoBananaSettings & OutputPolicy & ImageResults & { label?: string; locked?: boolean; imageInputs: number; exposed?: (keyof NanoBananaSettings)[] }, 'nano-banana'>;
export type SeedreamNode = Node<SeedreamSettings & OutputPolicy & ImageResults & { label?: string; locked?: boolean; imageInputs: number; exposed?: (keyof SeedreamSettings)[] }, 'seedream'>;
export const isSeedreamNode = (node: AppNode): node is SeedreamNode => node.type === 'seedream';
export type ImageGeneratorNode = SunburstNode | NanoBananaNode | SeedreamNode;
export const isNanoBananaNode = (node: AppNode): node is NanoBananaNode => node.type === 'nano-banana';
export const isImageGeneratorNode = (node: AppNode | undefined): node is ImageGeneratorNode => Boolean(node && (isSeedreamNode(node) || isSunburstNode(node) || isNanoBananaNode(node)));
export type InteractiveEditNode = Node<InteractiveEditData, 'interactive-edit'>;
export const isInteractiveEditNode = (node: AppNode | undefined): node is InteractiveEditNode => node?.type === 'interactive-edit';

export type AppNode = ImageGeneratorNode | TextNode | FileNode | InteractiveEditNode | BuiltInNode;

export const isNodeLocked = (node: AppNode | undefined): boolean => Boolean(node && 'locked' in node.data && node.data.locked);
