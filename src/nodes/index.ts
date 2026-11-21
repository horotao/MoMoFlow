import type { NodeTypes } from '@xyflow/react';
import { ImageNode } from './ImageNode';
import { FileNode } from './FileNode';
import { NanoBananaNode } from './NanoBananaNode';
import { SeedreamNode } from './SeedreamNode';
import { TextNode } from './TextNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [];
export const nodeTypes = {
  sunburst: ImageNode,
  text: TextNode,
  file: FileNode,
  seedream: SeedreamNode,
  'nano-banana': NanoBananaNode,
} satisfies NodeTypes;
