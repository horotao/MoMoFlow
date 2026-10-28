import type { NodeProps } from '@xyflow/react';
import type { ImageIteratorNode as ImageIteratorNodeType } from './types';
import { FileNode } from './FileNode';

export function ImageIteratorNode(props: NodeProps<ImageIteratorNodeType>) {
  return <FileNode {...props} />;
}
