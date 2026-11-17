import type { Edge } from '@xyflow/react';
import { resolveOutputSource } from './router.ts';
import { apimartFixedSettings, isImageGenerationInput, migrateSunburstProvider, sunburstFieldLabels, sunburstParameterDefaults, validateSunburstProvider, validateSunburstSettings, validateSunburstVariant } from './sunburst.ts';
import { nanoBananaChoices, validateNanoBananaSettings } from './nanoBanana.ts';
import { isSeedreamExactSize, seedreamChoices, validateSeedreamSettings } from './seedream.ts';
import { resolveTextValue } from './textVariables.ts';
import { isSunburstNode, isNanoBananaNode, isSeedreamNode, type AppNode, type ModelInputNode, type SunburstNode } from './types.ts';

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

export function migrateImageModelGraph(nodes: AppNode[], edges: Edge[]) {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const retired = new Map<string, Edge[]>();
  const providerInputs = new Set<string>();
  const keptEdges = edges.filter(edge => {
    const target = nodesById.get(edge.target)?.type;
    if (target !== 'sunburst' && target !== 'nano-banana' && target !== 'seedream') return true;
    if (isImageGenerationInput(edge.targetHandle, target === 'sunburst')) return true;
    const entries = retired.get(edge.target) ?? [];
    entries.push(edge);
    retired.set(edge.target, entries);
    if (target === 'sunburst' && edge.targetHandle === 'provider') {
      const source = resolveOutputSource(nodesById.get(edge.source), edge.sourceHandle, nodes, edges)?.node;
      if (isModelInput(source) && (source.data.parameter === 'provider' || source.data.parameter === undefined)) providerInputs.add(source.id);
    }
    return false;
  });
  function readValues(oldEdges: Edge[], fields: object) {
    const values: Record<string, string> = {};
    for (const edge of oldEdges) {
      const field = edge.targetHandle;
      if (!field || !Object.prototype.hasOwnProperty.call(fields, field) || field in values) continue;
      values[field] = resolveTextValue(edge.source, nodes, edges).trim();
    }
    return values;
  }
  return {
    nodes: nodes.map(node => {
      if (isModelInput(node)) {
        const data = migrateSunburstProviderInput(node.data, providerInputs.has(node.id));
        return data === node.data ? node : { ...node, data };
      }
      const oldEdges = retired.get(node.id);
      if (isNanoBananaNode(node) || isSeedreamNode(node)) {
        if (!oldEdges && !('exposed' in node.data)) return node;
        if (isSeedreamNode(node)) {
          const data = { ...node.data };
          delete data.exposed;
          if (!oldEdges) return { ...node, data };
          const values = readValues(oldEdges, seedreamChoices);
          if (isSeedreamExactSize(values.size ?? data.size)) delete values.resolution;
          try {
            return { ...node, data: { ...data, ...validateSeedreamSettings({ ...data, ...values }) } };
          } catch { return { ...node, data }; }
        }
        const data = { ...node.data };
        delete data.exposed;
        if (!oldEdges) return { ...node, data };
        try {
          return { ...node, data: { ...data, ...validateNanoBananaSettings({ ...data, ...readValues(oldEdges, nanoBananaChoices) }) } };
        } catch { return { ...node, data }; }
      }
      if (!isSunburstNode(node)) return node;
      const migrated = migrateSunburstProvider(node.data.provider);
      if (!oldEdges && !migrated && !('exposed' in node.data)) return node;
      const data = { ...node.data, ...migrated };
      delete data.exposed;
      if (!oldEdges) return { ...node, data };

      const values = readValues(oldEdges, sunburstFieldLabels);
      const settings = { ...sunburstParameterDefaults, ...data, ...values, ...apimartFixedSettings };
      const provider = migrateSunburstProvider(settings.provider);
      const candidate = { ...settings, ...provider, ...('channelModel' in values ? { channelModel: values.channelModel } : {}) };
      try {
        const restored: SunburstNode['data'] = {
          ...data,
          ...validateSunburstSettings(candidate),
          provider: validateSunburstProvider(candidate.provider),
          variant: validateSunburstVariant(candidate.variant),
        };
        return { ...node, data: restored };
      } catch {
        // An invalid combination must not overwrite the node's local settings.
        return { ...node, data };
      }
    }),
    edges: keptEdges,
  };
}
