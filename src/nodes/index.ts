import type { NodeTypes } from '@xyflow/react';
import { CanvasImageNode } from './CanvasImageNode';
import { CanvasTextNode } from './CanvasTextNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [];
export const nodeTypes = { sunburst: CanvasImageNode, text: CanvasTextNode } satisfies NodeTypes;
