import type { NodeTypes } from '@xyflow/react';
import { CanvasImageNode } from './CanvasImageNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [];
export const nodeTypes = { sunburst: CanvasImageNode } satisfies NodeTypes;
