import type { Edge, EdgeTypes } from '@xyflow/react';
import { WorkflowEdge } from './WorkflowEdge';

export const initialEdges: Edge[] = [];

export const edgeTypes = {
  default: WorkflowEdge,
} satisfies EdgeTypes;
