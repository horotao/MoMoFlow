import type { Edge } from '@xyflow/react';
import { resolveOutputSource } from './router.ts';
import { migrateSunburstProvider } from './sunburst.ts';
import { isSunburstNode, type AppNode, type ModelInputNode } from './types.ts';

function isModelInput(node: AppNode | undefined): node is ModelInputNode {
  return node?.type === 'model-input' && 'model' in node.data && typeof node.data.model === 'string';
}

export function migrateSunburstProviderInput(data: ModelInputNode['data'], connected = false): ModelInputNode['data'] {
  if (data.parameter !== 'provider' && !connected) return data;
  const model = migrateSunburstProvider(data.model)?.provider ?? data.model;
  const options = data.options?.some(option => migrateSunburstProvider(option))
    ? [...new Set(data.options.map(option => migrateSunburstProvider(option)?.provider ?? option))]
    : data.options;
  return model === data.model && options === data.options ? data : { ...data, model, options };
}

export function migrateSunburstNodes(nodes: AppNode[], edges: Edge[]): AppNode[] {
  const routedInputs = new Map<string, ModelInputNode>();
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  for (const edge of edges) {
    if (edge.targetHandle !== 'provider' || nodesById.get(edge.target)?.type !== 'sunburst') continue;
    const source = resolveOutputSource(nodesById.get(edge.source), edge.sourceHandle, nodes, edges)?.node;
    if (isModelInput(source) && (source.data.parameter === 'provider' || source.data.parameter === undefined)) {
      routedInputs.set(edge.target, source);
    }
  }
  const inferredInputs = new Set([...routedInputs.values()].map(node => node.id));
  return nodes.map(node => {
    if (isModelInput(node)) {
      const data = migrateSunburstProviderInput(node.data, inferredInputs.has(node.id));
      return data === node.data ? node : { ...node, data };
    }
    if (!isSunburstNode(node)) return node;
    const local = migrateSunburstProvider(node.data.provider);
    if (local) return { ...node, data: { ...node.data, ...local } };
    // The source will be migrated independently. Prepare the target's APIMart
    // settings while retaining its local fallback and connected overrides.
    const incoming = migrateSunburstProvider(routedInputs.get(node.id)?.data.model);
    return incoming ? { ...node, data: { ...node.data, channelModel: incoming.channelModel } } : node;
  });
}
