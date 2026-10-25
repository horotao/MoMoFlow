import { CompareNode } from './CompareNode';
import { ResizeNode } from './ResizeNode';
import { ColorPaletteNode } from './ColorPaletteNode';
import { CompositorNode } from './compositor/CompositorNode';
import { RotateFlipNode } from './RotateFlipNode';
import { InvertNode } from './InvertNode';
import { LevelsNode } from './LevelsNode';
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
  compare: CompareNode,
  'color-palette': ColorPaletteNode,
  compositor: CompositorNode,
  resize: ResizeNode,
  'rotate-flip': RotateFlipNode,
  invert: InvertNode,
  levels: LevelsNode,
  blur: BlurNode,
  'color-correction': ColorCorrectionNode,
  crop: CropNode,
  preview: PreviewNode,
  painter: PainterNode,
  sunburst: SunburstNode,
  text: TextNode,
  'image-describer': ImageDescriberNode,
  'model-input': ModelInputNode,
  file: FileNode,
  'position-logger': PositionLoggerNode,
  // Add any of your custom nodes here!
} satisfies NodeTypes;
