import type { Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { imageOutput } from './sunburstRun.ts';
import { fileOutputKind } from './fileCollection.ts';

// Resolve from the live graph so disconnected or invalidated outputs never linger.
export function previewImages(id: string, nodes: AppNode[], edges: Edge[]) {
  const edge = edges.find(item => item.target === id && item.targetHandle === 'file');
  const source = edge && nodes.find(item => item.id === edge.source);
  if (!source || (source.type === 'file' && fileOutputKind(source.data) !== 'image')) return [];
  return imageOutput(source, edge?.sourceHandle, nodes, edges);
}
