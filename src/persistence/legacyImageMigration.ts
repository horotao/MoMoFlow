import type { Edge } from '@xyflow/react';
import { createsImageCycle, isImageWire, isCanvasWire } from '../nodes/connectionRules.ts';
import { migrateFileAnnotations } from '../nodes/annotationMigration.ts';
import { activeFileAsset, orderedAssets } from '../nodes/fileCollection.ts';
import { savedImagePrompt } from '../nodes/generationRecord.ts';
import { migrateImageModelGraph } from '../nodes/sunburstMigration.ts';
import { defaultSunburstSettings, imageSizeLabels, imageSizes, sunburstSizePreset } from '../nodes/sunburst.ts';
import { isTextNode, resolveTextValue } from '../nodes/textVariables.ts';
import { anchorCanvasImage } from '../nodes/canvasImageGeometry.ts';
import { isCanvasImageNode, isCanvasTextNode, isFileNode, isImageGeneratorNode, type AppNode, type CanvasText, type CanvasImage, type FileAsset, type ImageGeneratorNode } from '../nodes/types.ts';

export function hasLegacyImageGraph(nodes: AppNode[], edges: Edge[]) {
  return nodes.some(node => (!isCanvasImageNode(node) && !isCanvasTextNode(node)) || node.parentId || 'exposed' in node.data) || edges.some(edge => !isCanvasWire(edge));
}

function positionOnCanvas(node: AppNode, nodes: Map<string, AppNode>) {
  const position = { ...node.position };
  const visited = new Set([node.id]);
  let current: AppNode | undefined = node;
  while (current) {
    const { position: relative, origin, measured, width, height, parentId } = current;
    if (current !== node) {
      position.x += relative.x;
      position.y += relative.y;
    }
    if (origin) {
      position.x -= origin[0] * (measured?.width ?? width ?? 0);
      position.y -= origin[1] * (measured?.height ?? height ?? 0);
    }
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);
    current = nodes.get(parentId);
  }
  return position;
}

function modelData(node: ImageGeneratorNode, prompt: string): CanvasImage['data'] {
  const { data } = node;
  if (node.type === 'sunburst') {
    const settings = { ...defaultSunburstSettings, ...node.data };
    delete settings.exposed;
    const size = settings.size ?? 'auto';
    const preset = sunburstSizePreset(size);
    const index = preset ? imageSizes.indexOf(preset.ratio) : -1;
    const ratio = index >= 0 ? imageSizeLabels[index] : size.includes(':') ? size : 'auto';
    return { ...settings, imageInputs: 16, composer: { prompt, quantity: 1, ratio } };
  }
  const { label, locked, activeResultId, results, orderBy, annotations, outputMode, sourceSignature } = data;
  const modelId = node.type === 'seedream' ? 'seedream-5-5' : 'nano-banana-2-1';
  const selection: CanvasImage['data']['composer']['selection'] = { modelIds: [modelId], autoSelect: false, multiple: false };
  const settings: Record<string, string> = node.type === 'seedream'
    ? { resolution: node.data.resolution, background: node.data.background, outputFormat: node.data.outputFormat,
        nsfwCheck: String(node.data.nsfwCheck ?? false), watermark: String(node.data.watermark ?? false) }
    : { resolution: node.data.imageSize, outputFormat: node.data.outputFormat };
  return {
    ...defaultSunburstSettings, imageInputs: 16, label, locked, activeResultId, results, orderBy, annotations, outputMode, sourceSignature,
    composer: { prompt, quantity: 1, ratio: node.type === 'seedream' ? node.data.size ?? 'auto' : node.data.aspectRatio,
      selection, modelSettings: { [modelId]: settings } },
  };
}

export function migrateLegacyImageGraph(nodes: AppNode[], edges: Edge[], hasAsset: (asset: FileAsset) => boolean = () => true): {
  nodes: AppNode[]; edges: Edge[];
} {
  if (!hasLegacyImageGraph(nodes, edges)) {
    const ids = new Set(nodes.map(node => node.id));
    return { nodes: nodes.map(anchorCanvasImage), edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }
  const legacy = migrateImageModelGraph(nodes, edges);
  const graph = migrateFileAnnotations(legacy.nodes, legacy.edges);
  const sources = new Map(graph.nodes.map(node => [node.id, node]));
  const copiedPrompts = new Set<string>();
  const converted = new Map<string, CanvasImage | CanvasText>(graph.nodes.filter(isCanvasTextNode).map(node => [node.id, anchorCanvasImage(node)]));
  const add = (node: AppNode, data: CanvasImage['data']) => {
    converted.set(node.id, anchorCanvasImage({ id: node.id, type: 'sunburst', position: positionOnCanvas(node, sources), data }));
  };

  for (const node of graph.nodes) {
    if (isImageGeneratorNode(node)) {
      const input = graph.edges.find(edge => edge.target === node.id && edge.targetHandle === 'prompt');
      const source = input && sources.get(input.source);
      const prompt = source && isTextNode(source) ? resolveTextValue(source.id, graph.nodes, graph.edges) : undefined;
      if (prompt?.trim() && source) copiedPrompts.add(source.id);
      if (isCanvasImageNode(node)) {
        const data = prompt?.trim() ? { ...node.data, composer: { ...node.data.composer, prompt } } : node.data;
        if (node.parentId) add(node, data);
        else converted.set(node.id, anchorCanvasImage(data === node.data ? node : { ...node, data }));
        continue;
      }
      const results = node.data.results?.filter(asset => asset.kind === 'image' && hasAsset(asset));
      const active = results?.find(asset => asset.id === node.data.activeResultId) ?? results?.[results.length - 1];
      const data = modelData(node, prompt?.trim() ? prompt : (active && savedImagePrompt(active)) ?? '');
      add(node, { ...data, results, activeResultId: active?.id });
      continue;
    }
    if (isFileNode(node)) {
      const results = orderedAssets(node.data).filter(asset => asset.kind === 'image' && hasAsset(asset));
      if (!results.length) continue;
      add(node, { ...defaultSunburstSettings, imageInputs: 16, label: node.data.label ?? results[0].name, locked: node.data.locked,
        composer: { prompt: '', quantity: 1, ratio: '1:1' }, results, activeResultId: activeFileAsset(node.data, results)?.id });
    }
  }

  for (const node of graph.nodes) {
    if (!isTextNode(node) || isCanvasTextNode(node) || copiedPrompts.has(node.id)) continue;
    const prompt = resolveTextValue(node.id, graph.nodes, graph.edges);
    if (!prompt.trim()) continue;
    add(node, { ...defaultSunburstSettings, imageInputs: 16, label: node.data.label, locked: node.data.locked,
      composer: { prompt, quantity: 1, ratio: '1:1' } });
  }

  const wires: Edge[] = [];
  // Keep a saved new-design wire ahead of any legacy wire that maps to the same slot.
  for (const edge of [...graph.edges.filter(isImageWire), ...graph.edges.filter(edge => !isImageWire(edge))]) {
    const source = sources.get(edge.source);
    const target = sources.get(edge.target);
    if (source && target && isCanvasTextNode(target) && converted.has(source.id) && converted.has(target.id)
      && (isCanvasImageNode(source) && isImageWire(edge) || isCanvasTextNode(source) && edge.sourceHandle === 'text' && edge.targetHandle === 'text')) {
      if (!wires.some(item => item.target === edge.target && (item.source === edge.source || item.targetHandle === edge.targetHandle)) && !createsImageCycle(edge, wires)) wires.push(edge);
      continue;
    }
    if (!source || !target || !converted.has(source.id) || !converted.has(target.id) || !isImageGeneratorNode(target)) continue;
    if (!(isFileNode(source) ? edge.sourceHandle === 'file' : isImageGeneratorNode(source) && edge.sourceHandle === 'result')) continue;
    const wire = isCanvasImageNode(source) && isCanvasImageNode(target) ? edge
      : { id: edge.id, source: edge.source, target: edge.target, targetHandle: edge.targetHandle, sourceHandle: 'result' };
    if (!isImageWire(wire) || wires.some(item => item.target === wire.target
      && (item.targetHandle === wire.targetHandle || item.source === wire.source)) || createsImageCycle(wire, wires)) continue;
    wires.push(wire);
  }
  return { nodes: graph.nodes.flatMap(node => converted.get(node.id) ?? []), edges: wires };
}
