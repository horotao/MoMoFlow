import type { IdeogramEditSettings, IdeogramField, IdeogramSettings } from './ideogram';
import type { MasksExtractorData } from './masksExtractor';
import type { NanoBananaSettings } from './nanoBanana';
import type { BlendData } from './blend';
import type { CompareData } from './compare';
import type { ResizeData } from './resize';
import type { ColorPaletteData } from './colorPalette';
import type { CompositorData } from './compositor';
import type { RotateFlipData } from './rotateFlip';
import type { InvertData } from './invert';
import type { LevelsData } from './levels';
import type { MatteGrowShrinkData } from './matteGrowShrink';
import type { BlurData } from './blur';
import type { ColorCorrectionData } from './colorCorrection';
import type { CropData } from './crop';
import type { PainterData } from './painter';
import type { Node, BuiltInNode } from '@xyflow/react';
import type { SunburstSettings } from './sunburst';
import type { JSONContent } from '@tiptap/core';

export type PositionLoggerNode = Node<{ label: string }, 'position-logger'>;
export type TextDisplayMode = 'source-value' | 'value' | 'source';
export type TextNode = Node<{ text: string; label?: string; locked?: boolean; content?: JSONContent; variableCount?: number; displayMode?: TextDisplayMode }, 'text'>;
export type FileAsset = {
  id: string; name: string; url: string; kind: 'image' | 'video' | 'audio' | '3d'; size?: number; width?: number; height?: number;
  // Preserve gray-mask semantics through pass-through nodes and saved snapshots.
  maskMode?: 'luminance';
};
export type FileNode = Node<{ label?: string; locked?: boolean; asset?: FileAsset; assets?: FileAsset[]; activeAssetId?: string; viewMode?: 'single' | 'all'; orderBy?: 'date' | 'name' }, 'file'>;
export type ImageDescriberNode = Node<{ label?: string; locked?: boolean; text: string; model: string; instructions: string; imageInputs: number; exposed?: ('model' | 'instructions')[] }, 'image-describer'>;
export type ModelInputNode = Node<{ label?: string; locked?: boolean; model: string; options?: string[]; parameter?: keyof SunburstSettings | keyof NanoBananaSettings | IdeogramField }, 'model-input'>;
export type SunburstNode = Node<SunburstSettings & { label?: string; locked?: boolean; imageInputs: number; exposed?: (keyof SunburstSettings)[]; results?: FileAsset[]; activeResultId?: string; orderBy?: 'date' | 'name' }, 'sunburst'>;
export const isSunburstNode = (node: AppNode): node is SunburstNode => node.type === 'sunburst';
export type NanoBananaNode = Node<NanoBananaSettings & { label?: string; locked?: boolean; imageInputs: number; exposed?: (keyof NanoBananaSettings)[]; results?: FileAsset[]; activeResultId?: string; orderBy?: 'date' | 'name' }, 'nano-banana'>;
export type IdeogramNode = Node<IdeogramSettings & Partial<IdeogramEditSettings> & { label?: string; locked?: boolean; imageInputs: number; exposed?: IdeogramField[]; results?: FileAsset[]; activeResultId?: string; orderBy?: 'date' | 'name' }, 'ideogram'>;
export const isIdeogramNode = (node: AppNode): node is IdeogramNode => node.type === 'ideogram';
export type ImageGeneratorNode = SunburstNode | NanoBananaNode | IdeogramNode;
export const isNanoBananaNode = (node: AppNode): node is NanoBananaNode => node.type === 'nano-banana';
export const isImageGeneratorNode = (node: AppNode): node is ImageGeneratorNode => isSunburstNode(node) || isNanoBananaNode(node) || isIdeogramNode(node);
export type MasksExtractorNode = Node<MasksExtractorData, 'masks-extractor'>;
export const isMasksExtractorNode = (node: AppNode | undefined): node is MasksExtractorNode => node?.type === 'masks-extractor';
export type PainterNode = Node<PainterData, 'painter'>;
export type PreviewNode = Node<{ label?: string; locked?: boolean; activeAssetId?: string }, 'preview'>;
export type CropNode = Node<CropData, 'crop'>;
export type ColorCorrectionNode = Node<ColorCorrectionData, 'color-correction'>;
export type MatteGrowShrinkNode = Node<MatteGrowShrinkData, 'matte-grow-shrink'>;
export const isMatteGrowShrinkNode = (node: AppNode | undefined): node is MatteGrowShrinkNode => node?.type === 'matte-grow-shrink' && 'settings' in node.data;
export type BlurNode = Node<BlurData, 'blur'>;
export const isBlurNode = (node: AppNode | undefined): node is BlurNode => node?.type === 'blur' && 'settings' in node.data;
export type LevelsNode = Node<LevelsData, 'levels'>;
export const isLevelsNode = (node: AppNode | undefined): node is LevelsNode => node?.type === 'levels' && 'settings' in node.data;
export type InvertNode = Node<InvertData, 'invert'>;
export const isInvertNode = (node: AppNode | undefined): node is InvertNode => node?.type === 'invert';
export type ResizeNode = Node<ResizeData, 'resize'>;
export const isResizeNode = (node: AppNode | undefined): node is ResizeNode => node?.type === 'resize' && 'settings' in node.data;

export type RotateFlipNode = Node<RotateFlipData, 'rotate-flip'>;
export const isRotateFlipNode = (node: AppNode | undefined): node is RotateFlipNode => node?.type === 'rotate-flip' && 'settings' in node.data;
export type CompositorNode = Node<CompositorData, 'compositor'>;
export const isCompositorNode = (node: AppNode | undefined): node is CompositorNode => node?.type === 'compositor';
export type ColorPaletteNode = Node<ColorPaletteData, 'color-palette'>;
export const isColorPaletteNode = (node: AppNode | undefined): node is ColorPaletteNode => node?.type === 'color-palette';
export type CompareNode = Node<CompareData, 'compare'>;
export const isCompareNode = (node: AppNode | undefined): node is CompareNode => node?.type === 'compare';
export type BlendNode = Node<BlendData, 'blend'>;
export const isBlendNode = (node: AppNode | undefined): node is BlendNode => node?.type === 'blend';
export type RouterNode = Node<{ label?: string; locked?: boolean }, 'router'>;
export type AppNode = IdeogramNode | MatteGrowShrinkNode | MasksExtractorNode | NanoBananaNode | RouterNode | BlendNode | CompareNode | ResizeNode | ColorPaletteNode | CompositorNode | RotateFlipNode | InvertNode | LevelsNode | BlurNode | ColorCorrectionNode | CropNode | PreviewNode | PainterNode | SunburstNode | ImageDescriberNode | ModelInputNode | BuiltInNode | PositionLoggerNode | TextNode | FileNode;

export const isDescriberNode = (node: AppNode): node is ImageDescriberNode => node.type === 'image-describer' && 'imageInputs' in node.data;

export const isNodeLocked = (node: AppNode | undefined): boolean => Boolean(node && 'locked' in node.data && node.data.locked);

export const isPainterNode = (node: AppNode | undefined): node is PainterNode => node?.type === 'painter' && 'strokes' in node.data;

export const isCropNode = (node: AppNode | undefined): node is CropNode => node?.type === 'crop' && 'rect' in node.data;

export const isColorCorrectionNode = (node: AppNode | undefined): node is ColorCorrectionNode => node?.type === 'color-correction' && 'settings' in node.data;
