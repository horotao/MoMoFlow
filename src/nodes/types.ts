import type { ColorTag } from './colorTags';
import type { TextBilling, TextUsage } from './textPricing';
import type { AnnotationHistory, InteractiveEditData } from './interactiveEdit';
import type { GenerationRecord, OutputPolicy } from './executionGraph';
import type { SeedreamSettings } from './seedream';
import type { NanoBananaSettings } from './nanoBanana';
import type { Node, BuiltInNode } from '@xyflow/react';
import type { SunburstParameter, SunburstProvider, SunburstSettings } from './sunburst';
import type { JSONContent } from '@tiptap/core';

export type TextDisplayMode = 'source-value' | 'value' | 'source';
export type TextReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface PromptMention { nodeId: string; from: number; to: number }
export interface TextComposerData {
  mentions?: PromptMention[];
  prompt: string; format: 'txt' | 'md'; quantity: number; reasoningEffort?: TextReasoningEffort; webSearch?: boolean;
  selection: { modelIds: string[]; autoSelect: boolean; multiple: boolean };
}
export interface TextCitation { url: string; title: string; startIndex: number; endIndex: number }
export interface TextGenerationResult {
  id: string; text: string; prompt: string; model: string; responseId: string; createdAt: number; reasoningEffort?: TextReasoningEffort; webSearch?: boolean; citations?: TextCitation[]; usage?: TextUsage; billing?: TextBilling;
}
export type TextNode = Node<{ text: string; colorTags?: ColorTag[]; textComposer?: TextComposerData; textGeneration?: { model: string; responseId: string; createdAt: number }; textHistory?: TextGenerationResult[]; activeTextResultId?: string; label?: string; locked?: boolean; content?: JSONContent; variableCount?: number; displayMode?: TextDisplayMode }, 'text'>;
export type CanvasText = TextNode & { data: { textComposer: TextComposerData } };
export const isCanvasTextNode = (node: AppNode): node is CanvasText => node.type === 'text' && 'textComposer' in node.data && Boolean(node.data.textComposer);
export type FileAsset = {
  id: string; name: string; url: string; kind: 'image' | 'video' | 'audio' | '3d'; size?: number; width?: number; height?: number;
  mimeType?: string; createdAt?: number;
  // Preserve gray-mask semantics through pass-through nodes and saved snapshots.
  maskMode?: 'luminance';
  contentHash?: string; generation?: GenerationRecord;
  // Keep the original pixels so reopening Crop can expand beyond the last crop.
  crop?: { source: Omit<FileAsset, 'crop'>; rect: ImageCropRect };
};
export interface ImageCropRect { x: number; y: number; width: number; height: number }
export interface ImageInpaintInput { image: FileAsset; mask: FileAsset }
export type FileNode = Node<{ label?: string; locked?: boolean; asset?: FileAsset; assets?: FileAsset[]; activeAssetId?: string; viewMode?: 'single' | 'all'; orderBy?: 'date' | 'name'; annotations?: AnnotationHistory[] }, 'file'>;
export const isFileNode = (node: AppNode | undefined): node is FileNode => node?.type === 'file';
type ImageResults = { results?: FileAsset[]; activeResultId?: string; orderBy?: 'date' | 'name'; annotations?: AnnotationHistory[] };
export interface ImageComposerData {
  mentions?: PromptMention[];
  prompt: string;
  quantity: number;
  ratio: string;
  followReferenceRatio?: boolean;
  selection?: import('../components/image-prompt-node/imagePromptModels').ImagePromptModelSelection;
  modelSettings?: Record<string, Record<string, string>>;
}
export type SunburstNode = Node<SunburstSettings & OutputPolicy & ImageResults & { colorTags?: ColorTag[]; composer?: ImageComposerData; imageSource?: 'imported'; inpaint?: ImageInpaintInput; provider?: SunburstProvider; variant?: 'Sunburst' | 'Flare'; label?: string; locked?: boolean; imageInputs: number; exposed?: SunburstParameter[] }, 'sunburst'>;
export const isSunburstNode = (node: AppNode): node is SunburstNode => node.type === 'sunburst';
export type CanvasImage = SunburstNode & { data: { composer: ImageComposerData } };
export const isCanvasImageNode = (node: AppNode): node is CanvasImage => isSunburstNode(node) && Boolean(node.data.composer);
export const isImportedCanvasImage = (node: AppNode) => isCanvasImageNode(node) && node.data.imageSource === 'imported';
export type NanoBananaNode = Node<NanoBananaSettings & OutputPolicy & ImageResults & { label?: string; locked?: boolean; imageInputs: number; exposed?: (keyof NanoBananaSettings)[] }, 'nano-banana'>;
export type SeedreamNode = Node<SeedreamSettings & OutputPolicy & ImageResults & { label?: string; locked?: boolean; imageInputs: number; exposed?: (keyof SeedreamSettings)[] }, 'seedream'>;
export const isSeedreamNode = (node: AppNode): node is SeedreamNode => node.type === 'seedream';
export type ImageGeneratorNode = SunburstNode | NanoBananaNode | SeedreamNode;
export const isNanoBananaNode = (node: AppNode): node is NanoBananaNode => node.type === 'nano-banana';
export const isImageGeneratorNode = (node: AppNode | undefined): node is ImageGeneratorNode => Boolean(node && (isSeedreamNode(node) || isSunburstNode(node) || isNanoBananaNode(node)));
export type InteractiveEditNode = Node<InteractiveEditData, 'interactive-edit'>;
export const isInteractiveEditNode = (node: AppNode | undefined): node is InteractiveEditNode => node?.type === 'interactive-edit';

export type CanvasGroup = Node<{ label: string; color?: string; locked?: boolean }, 'canvas-group'>;
export const isCanvasGroup = (node: AppNode | undefined): node is CanvasGroup => node?.type === 'canvas-group';

export type AppNode = ImageGeneratorNode | TextNode | FileNode | InteractiveEditNode | CanvasGroup | BuiltInNode;

export const isNodeLocked = (node: AppNode | undefined): boolean => Boolean(node && 'locked' in node.data && node.data.locked);
