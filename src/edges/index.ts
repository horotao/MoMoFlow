import type { Edge, EdgeTypes } from '@xyflow/react';
import { MagneticEdge } from './MagneticEdge';

export const initialEdges: Edge[] = [];

export const edgeTypes = {
  default: MagneticEdge,
} satisfies EdgeTypes;
