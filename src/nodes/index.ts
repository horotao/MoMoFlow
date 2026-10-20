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
