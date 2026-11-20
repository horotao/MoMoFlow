import { SeedreamNode } from './SeedreamNode';
import { NanoBananaNode } from './NanoBananaNode';
import { SunburstNode } from './SunburstNode';
import type { NodeTypes } from '@xyflow/react';

import { FileNode } from './FileNode';
import { TextNode } from './TextNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [];

export const nodeTypes = {
  sunburst: SunburstNode,
  'nano-banana': NanoBananaNode,
  seedream: SeedreamNode,
  text: TextNode,
  file: FileNode,
  // Add any of your custom nodes here!
} satisfies NodeTypes;
