import type { Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { isDescriberNode } from './types.ts';
import { imageOutput } from './sunburstRun.ts';
import { resolveTextValue } from './textVariables.ts';
import type { PreviewTask } from './taskQueue';

export function prepareDescriberRun(nodes: AppNode[], edges: Edge[], ids: string[], runs: number): { tasks: PreviewTask[]; error?: string } {
  const tasks: PreviewTask[] = [];
  const batchId = crypto.randomUUID();
  const createdAt = Date.now();
  for (const id of new Set(ids)) {
    const node = nodes.find((item) => item.id === id);
    if (!node || !isDescriberNode(node) || node.data.locked) continue;
    const inputs = edges.filter((edge) => edge.target === id && edge.targetHandle?.startsWith('image-'));
    if (!inputs.some((edge) => {
      const source = nodes.find((item) => item.id === edge.source);
      return imageOutput(source).length > 0;
    })) return { tasks: [], error: 'Connect an image to every selected node before running.' };
    const modelEdge = edges.find((edge) => edge.target === id && edge.targetHandle === 'model');
    const model = modelEdge ? resolveTextValue(modelEdge.source, nodes, edges) : node.data.model;
    if (!model.trim()) return { tasks: [], error: 'Choose a model for every selected node before running.' };
    const instructionEdge = edges.find((edge) => edge.target === id && edge.targetHandle === 'instructions');
    const instructions = instructionEdge ? resolveTextValue(instructionEdge.source, nodes, edges) : node.data.instructions;
    const images = inputs.sort((a, b) => Number(a.targetHandle?.slice(6)) - Number(b.targetHandle?.slice(6))).flatMap((edge) => {
      const source = nodes.find((item) => item.id === edge.source);
      return imageOutput(source).map(asset => asset.url);
    });
    for (let index = 0; index < runs; index++) tasks.push({ id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model, instructions, images, progress: 0, state: 'Queued', started: 0 });
  }
  return { tasks };
}
