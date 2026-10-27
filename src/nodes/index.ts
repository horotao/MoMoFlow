import { IdeogramNode } from './IdeogramNode';
import { MasksExtractorNode } from './MasksExtractorNode';
import { NanoBananaNode } from './NanoBananaNode';
import { RouterNode } from './RouterNode';
import { BlendNode } from './BlendNode';
import { CompareNode } from './CompareNode';
import { ResizeNode } from './ResizeNode';
import { ColorPaletteNode } from './ColorPaletteNode';
import { CompositorNode } from './compositor/CompositorNode';
import { RotateFlipNode } from './RotateFlipNode';
import { InvertNode } from './InvertNode';
import { LevelsNode } from './LevelsNode';
import { MatteGrowShrinkNode } from './MatteGrowShrinkNode';
import { BlurNode } from './BlurNode';
import { ColorCorrectionNode } from './ColorCorrectionNode';
import { CropNode } from './CropNode';
import { PainterNode } from './PainterNode';
import { PreviewNode } from './PreviewNode';
import { SunburstNode } from './SunburstNode';
import { ImageDescriberNode, ModelInputNode } from './ImageDescriberNode';
import type { NodeTypes } from '@xyflow/react';

import { PositionLoggerNode } from './PositionLoggerNode';
import { FileNode } from './FileNode';
import { TextNode } from './TextNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [];

export const nodeTypes = {
  ideogram: IdeogramNode,
  'masks-extractor': MasksExtractorNode,
  router: RouterNode,
  blend: BlendNode,
  compare: CompareNode,
  'color-palette': ColorPaletteNode,
  compositor: CompositorNode,
  resize: ResizeNode,
  'rotate-flip': RotateFlipNode,
  invert: InvertNode,
  levels: LevelsNode,
  blur: BlurNode,
  'matte-grow-shrink': MatteGrowShrinkNode,
  'color-correction': ColorCorrectionNode,
  crop: CropNode,
  preview: PreviewNode,
  painter: PainterNode,
  sunburst: SunburstNode,
  'nano-banana': NanoBananaNode,
  text: TextNode,
  'image-describer': ImageDescriberNode,
  'model-input': ModelInputNode,
  file: FileNode,
  'position-logger': PositionLoggerNode,
  // Add any of your custom nodes here!
} satisfies NodeTypes;
