import { ImageDescriberNode, ModelInputNode } from './ImageDescriberNode';
import type { NodeTypes } from '@xyflow/react';

import { PositionLoggerNode } from './PositionLoggerNode';
import { FileNode } from './FileNode';
import { TextNode } from './TextNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [];

export const nodeTypes = {
  text: TextNode,
  'image-describer': ImageDescriberNode,
  'model-input': ModelInputNode,
  file: FileNode,
  'position-logger': PositionLoggerNode,
  // Add any of your custom nodes here!
} satisfies NodeTypes;
