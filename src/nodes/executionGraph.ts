import { mapAssets } from '../persistence/workflowStorage.ts';
import { isTextNode } from './textVariables.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, ImageGeneratorNode } from './types';
import { isImageGeneratorNode, isImportedCanvasImage, isCanvasImageNode, isCanvasTextNode, isNodeLocked } from './types.ts';
import { numberedMentionPrompt } from './promptMentionText.ts';
import { annotationOutput, pinnedResultAsset, pinnedResultInput, selectedImageResult, storedAnnotationResult } from './annotationGraph.ts';
import { isAnnotationInput } from './interactiveEdit.ts';
import { hasVariable } from './textDocument.ts';
import { fileAssets } from './fileCollection.ts';
import { imageOutput } from './sunburstRun.ts';
import { apimartFixedSettings, isImageGenerationInput, sunburstParameterDefaults, validateSunburstProvider, validateSunburstImageInputs, validateSunburstMarkup, defaultSunburstSettings, validateSunburstSettings } from './sunburst.ts';
import { defaultSeedreamSettings, validateSeedreamSettings } from './seedream.ts';
import { hasSplitSeedreamPrompt, prepareSeedreamRun } from './seedreamRun.ts';
import { defaultNanoBananaSettings, validateNanoBananaSettings } from './nanoBanana.ts';
import { resolveTextValue } from './textVariables.ts';
import { effectiveSunburstSettings, prepareSunburstRun, resolveSunburstEditPrompt } from './sunburstRun.ts';
import { prepareNanoBananaRun } from './nanoBananaRun.ts';
import { outputKind } from './outputPort.ts';
import type { PreviewTask } from './taskQueue';
import { composerExecutionNode } from './imageComposerSettings.ts';
import { modelInputSignatureVersion, savedImagePrompt } from './generationRecord.ts';

export type ExecutionGraph = {
  nodes: AppNode[];
  edges: Edge[];
  // Keep the execution boundary stable while a batch creates its first results.
  refreshImages?: ReadonlySet<string>;
  existingImagesOnly?: boolean;
};
export type GenerationRecord = { version: 1; taskId?: string; inputSignature: string; outputSignature: string };
export type OutputPolicy = { outputMode?: 'manual' | 'fixed'; sourceSignature?: string };
export const isModelNode = (node: AppNode | undefined): node is ImageGeneratorNode =>
  isImageGeneratorNode(node) && !isImportedCanvasImage(node);
export const stableSignature = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
  if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  return item;
});
export function selectedResult(node: AppNode) {
  return isImageGeneratorNode(node) ? selectedImageResult(node) : undefined;
}
export function fixedOutput(node: AppNode, graph: ExecutionGraph) {
  return isImageGeneratorNode(node) && (isImportedCanvasImage(node) || !graph.refreshImages?.has(node.id)) && Boolean(selectedResult(node));
}
export function executionInputs(node: AppNode, _handle: string | null | undefined, graph: ExecutionGraph): Edge[] {
  // Text exposes its selected completed result (or authored prompt), never its dependencies.
  if (isCanvasTextNode(node)) return [];
  // The incoming visual connection identifies the origin of a pinned edit.
  if (isCanvasImageNode(node) && node.data.inpaint) return [];
  const edges = graph.edges.filter(edge => edge.target === node.id
    && (!isTextNode(node) || !isAnnotationInput(edge.targetHandle)
      || annotationOutput(graph.nodes.find(source => source.id === edge.source), edge.sourceHandle, graph.nodes, graph.edges)));

  if (isTextNode(node) && node.data.content) return edges.filter(edge => hasVariable(node.data.content!, edge.targetHandle ?? 'variable-1'));
  if (node.type === 'file') return [];
  if (node.type === 'seedream' && edges.some(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))) {
    const prompt = edges.find(edge => edge.targetHandle === 'prompt');
    if (prompt && hasSplitSeedreamPrompt(prompt.source, graph.nodes, graph.edges)) return [prompt];
  }
  if (isImageGeneratorNode(node)) {
    const prompt = edges.find(edge => edge.targetHandle === 'prompt');
    return edges.filter(edge => isImageGenerationInput(edge.targetHandle, node.type === 'sunburst')).map(edge =>
      /^image-\d+$/.test(edge.targetHandle ?? '') ? pinnedResultInput(edge, prompt?.source, graph.nodes, graph.edges) ?? edge : edge);
  }

  return edges;
}
// Only original inputs are mandatory before execution. Derived outputs are
// checked lazily after reuse has been established, so an expired cache can heal.
export function executionSourceAssets(graph: ExecutionGraph, target: string, targets = [target]): FileAsset[] {
  const assets = new Map<string, FileAsset>(), visited = new Set<string>();
  const add = (asset?: FileAsset) => { if (asset?.kind === 'image') assets.set(asset.url, asset); };
  const visit = (id: string, handle?: string | null) => {
    const key = JSON.stringify([id, handle]);
    if (visited.has(key)) return;
    visited.add(key);
    const node = graph.nodes.find(item => item.id === id);
    if (!node) return;
    const annotation = storedAnnotationResult(node, handle, graph.nodes, graph.edges);
    if (annotation) { add(annotation.image); return; }
    if (!targets.includes(id) && fixedOutput(node, graph)) { add(selectedResult(node)); return; }
    if (isCanvasImageNode(node) && node.data.inpaint) {
      add(node.data.inpaint.image);
      add(node.data.inpaint.mask);
      return;
    }
    const inputs = executionInputs(node, handle, graph);
    const connected = (port: string) => inputs.some(edge => edge.targetHandle === port);
    if (node.type === 'file') {
      if (handle && handle !== 'file') add(annotationOutput(node, handle, graph.nodes, graph.edges)?.image);
      else fileAssets(node.data).forEach(add);
    }
    else if ('baseImage' in node.data && !connected('image')) add(node.data.baseImage as FileAsset | undefined);
    inputs.forEach(edge => visit(edge.source, edge.sourceHandle));
  };
  visit(target);
  return [...assets.values()];
}
export class ExecutionProblem extends Error {
  nodeId: string;
  readonly reason: string;
  constructor(nodeId: string, reason: string, nodeLabel?: string) {
    super(nodeLabel ? `${nodeLabel}：${reason}` : reason);
    this.nodeId = nodeId;
    this.reason = reason;
  }
}
export function nodeProblem(node: AppNode, message: string): never {
  throw new ExecutionProblem(node.id, message, node.data.label || node.type);
}

// Output content is part of the edit guard, but derived local renders are not.
// The runtime advances this guard itself when it commits an accepted result.
function configuration(node: AppNode, graph: ExecutionGraph, handle?: string | null) {
  const data = { ...node.data } as Record<string, unknown>;
  for (const key of ['label', 'exposed', 'imageInputs', 'variableCount', 'displayMode', 'orderBy', 'viewMode', 'generation', 'sourceSignature']) delete data[key];
  if (node.type === 'sunburst') for (const field of Object.keys(apimartFixedSettings)) delete data[field];

  if (node.type === 'file') {
    if (!handle || handle === 'file') return { locked: data.locked, assets: fileAssets(node.data).map(assetIdentity) };
    const annotation = annotationOutput(node, handle, graph.nodes, graph.edges);
    return annotation && { asset: assetIdentity(annotation.image), mark: annotation.mark, index: annotation.index };
  }
  if (isImageGeneratorNode(node)) {
    delete data.results;
    delete data.annotations;
    const result = selectedResult(node);
    data.activeResult = result ? { resultId: result.id, ...assetIdentity(result) } : undefined;
  }

  if (isTextNode(node) && node.data.content) delete data.text;
  for (const edge of executionInputs(node, handle, graph)) if (edge.targetHandle && ['model', 'instructions', 'quality', 'background', 'size', 'outputFormat', 'aspectRatio', 'imageSize', 'resolution'].includes(edge.targetHandle)) delete data[edge.targetHandle];
  return JSON.parse(JSON.stringify(data, (key, value: unknown) => key === 'url' && typeof value === 'string' && value.startsWith('blob:') ? '<local-asset>' : value));
}
export function assetIdentity(asset: FileAsset) {
  return { id: asset.contentHash ?? asset.id, maskMode: asset.maskMode, remote: /^https?:/.test(asset.url) ? asset.url : undefined };
}
export function graphGuard(graph: ExecutionGraph, id: string, force = false, handle?: string | null): string {
  const records = new Map<string, unknown>();
  const visit = (nodeId: string, port: string | null | undefined, forced: boolean, path: Set<string>) => {
    const node = graph.nodes.find(item => item.id === nodeId);
    if (!node) throw new ExecutionProblem(nodeId, '节点已删除。');
    const key = JSON.stringify([nodeId, port ?? null, forced]);
    if (path.has(key)) nodeProblem(node, '检测到循环依赖。');
    if (records.has(key)) return key;
    const annotation = storedAnnotationResult(node, port, graph.nodes, graph.edges);
    if (annotation) {
      records.set(key, [node.type, assetIdentity(annotation.image), 'mark' in annotation ? [annotation.mark, annotation.index] : undefined]);
    } else if (!forced && fixedOutput(node, graph)) {
      records.set(key, [node.type, { resultId: selectedResult(node)!.id, ...assetIdentity(selectedResult(node)!) }, 'outputMode' in node.data ? node.data.outputMode : undefined]);
    } else {
      const inputs = executionInputs(node, port, graph).map(edge => [edge.targetHandle, edge.sourceHandle, visit(edge.source, edge.sourceHandle, false, new Set(path).add(key))]);
      records.set(key, [node.type, configuration(node, graph, port), inputs.sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
    }
    return key;
  };
  visit(id, handle, force, new Set());
  // A flat adjacency list avoids exponential escaping of nested JSON strings.
  return stableSignature([...records].sort(([a], [b]) => a.localeCompare(b)));
}
export function prepareModel(graph: ExecutionGraph, id: string): PreviewTask[] {
  const original = graph.nodes.find(item => item.id === id);
  if (!original) throw new ExecutionProblem(id, '节点已删除。');
  if (!isModelNode(original)) nodeProblem(original, '节点已下线或不能运行。');
  let node;
  try { node = composerExecutionNode(original); }
  catch (error) { nodeProblem(original, error instanceof Error ? error.message : '无法选择生成模型。'); }

  const nodes = node === original ? graph.nodes : graph.nodes.map(item => item.id === id ? node : item);
  const prompt = original.type === 'sunburst' ? original.data.composer?.prompt : undefined;
  const result = node.type === 'sunburst' ? prepareSunburstRun(nodes, graph.edges, [id], 1)
    : node.type === 'nano-banana' ? prepareNanoBananaRun(nodes, graph.edges, [id], 1, prompt)
    : prepareSeedreamRun(nodes, graph.edges, [id], 1, prompt);
  if (result.error || !result.tasks[0]) nodeProblem(node, result.error ?? '节点已锁定或不能运行。');

  for (const edge of executionInputs(node, undefined, graph).filter(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))) {
    if (!imageOutput(graph.nodes.find(item => item.id === edge.source), edge.sourceHandle).length) nodeProblem(node, '连接的图片尚未准备完成。');
  }
  const promptEdge = graph.edges.find(edge => edge.target === id && edge.targetHandle === 'prompt');
  const source = promptEdge ? graph.nodes.find(item => item.id === promptEdge.source) : original;
  const authored = source && isCanvasTextNode(source) && !source.data.text.trim() ? source.data.textComposer
    : !promptEdge && isCanvasImageNode(original) ? original.data.composer : undefined;
  if (!authored?.mentions?.length) return result.tasks;
  const references = graph.edges.filter(edge => edge.target === id && /^image-\d+$/.test(edge.targetHandle ?? ''))
    .sort((a, b) => Number(a.targetHandle!.slice(6)) - Number(b.targetHandle!.slice(6)))
    .flatMap(edge => {
      const input = pinnedResultInput(edge, promptEdge?.source, graph.nodes, graph.edges) ?? edge;
      return imageOutput(graph.nodes.find(item => item.id === input.source), input.sourceHandle).map(asset => ({ nodeId: edge.source, url: asset.url }));
    });
  return result.tasks.map(task => {
    const request = task.imageRequest ?? task.seedreamRequest ?? task.nanoBananaRequest;
    // Annotation-generated instructions have their own image/coordinate syntax.
    if (!request || request.prompt !== authored.prompt.trim()) return task;
    try {
      const prompt = numberedMentionPrompt(authored.prompt, authored.mentions, references, request.images).trim();
      return { ...task,
        ...(task.imageRequest ? { imageRequest: { ...task.imageRequest, prompt } } : {}),
        ...(task.seedreamRequest ? { seedreamRequest: { ...task.seedreamRequest, prompt } } : {}),
        ...(task.nanoBananaRequest ? { nanoBananaRequest: { ...task.nanoBananaRequest, prompt } } : {}),
      };
    } catch (error) { nodeProblem(original, error instanceof Error ? error.message : '无法解析引用图片。'); }
  });
}
export function requestSignature(task: PreviewTask, graph: ExecutionGraph) {
  const assets = new Map<string, ReturnType<typeof assetIdentity>>();
  mapAssets(graph.nodes, asset => { assets.set(asset.url, assetIdentity(asset)); return asset; });
  const replace = (value: unknown): unknown => typeof value === 'string' && assets.has(value) ? assets.get(value)
    : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)])) : value;
  return stableSignature([modelInputSignatureVersion, task.model, replace(task.seedreamRequest ?? task.imageRequest ?? task.nanoBananaRequest)]);
}

export function earliestSavedImagePrompt(nodes: AppNode[]): string | undefined {
  let earliest = Infinity;
  let prompt: string | undefined;
  for (const node of nodes) {
    const assets = isImageGeneratorNode(node) ? node.data.results ?? [] : node.type === 'file' ? fileAssets(node.data) : [];
    for (const asset of assets) {
      // The image clients record completion time in result filenames.
      const time = Number(/-(\d{13})\.[^.]+$/.exec(asset.name)?.[1]);
      if (!Number.isFinite(time) || time >= earliest) continue;
      const candidate = savedImagePrompt(asset);
      if (!candidate) continue;
      earliest = time;
      prompt = candidate;
    }
  }
  return prompt;
}
export function reusable(node: AppNode, signature: string) {

  const asset = selectedResult(node);
  return Boolean(asset?.generation?.version === 1 && asset.generation.outputSignature === asset.id
    && asset.generation.inputSignature === signature);
}

// Validate values that are already knowable before submitting any model work.
// A model-produced text field is checked again by prepareModel after execution.
function validateKnownModelInputs(node: AppNode, graph: ExecutionGraph, targets: string[]) {
  const dynamic = (id: string, handle?: string | null, seen = new Set<string>()): boolean => {
    const key = `${id}:${handle ?? ''}`;
    if (seen.has(key)) return false; // Cycles are reported by the main preflight.
    seen.add(key);
    const source = graph.nodes.find(item => item.id === id);
    if (!source) return false;
    if (storedAnnotationResult(source, handle, graph.nodes, graph.edges)) return false;
    if (isModelNode(source)) return targets.includes(id) || !fixedOutput(source, graph);
    return executionInputs(source, handle, graph).some(edge => dynamic(edge.source, edge.sourceHandle, seen));
  };
  const inputs = executionInputs(node, undefined, graph);
  const unknown = new Set(inputs.filter(edge => dynamic(edge.source, edge.sourceHandle)).map(edge => edge.targetHandle));
  const knownSettings = (values: Record<string, unknown>, defaults: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, unknown.has(key) ? defaults[key] : value]));
  try {

    if (!isImageGeneratorNode(node)) return;
    const composer = node.type === 'sunburst' ? node.data.composer : undefined;
    const model = composerExecutionNode(node);
    const promptEdge = inputs.find(edge => edge.targetHandle === 'prompt');
    const sunburst = model.type === 'sunburst' ? effectiveSunburstSettings(model) : undefined;
    const edit = sunburst && promptEdge && !unknown.has('prompt')
      ? resolveSunburstEditPrompt(promptEdge.source, graph.nodes, graph.edges,
        sunburst.provider === 'apimart' && sunburst.channelModel !== 'gpt-image-2.6') : undefined;
    if (!unknown.has('prompt')) {
      if (model.type === 'seedream' && promptEdge && hasSplitSeedreamPrompt(promptEdge.source, graph.nodes, graph.edges)) {
        const nodes = model === node ? graph.nodes : graph.nodes.map(item => item.id === node.id ? model : item);
        const prepared = prepareSeedreamRun(nodes, graph.edges, [node.id], 1);
        if (prepared.error) throw new Error(prepared.error);
        return;
      }
      const prompt = edit?.prompt ?? (promptEdge ? resolveTextValue(promptEdge.source, graph.nodes, graph.edges).trim() : composer?.prompt.trim() ?? '');
      if (!prompt || prompt.length > 32000) throw new Error('请连接非空提示词，最多 32000 个字符。');
    }
    const inpaint = isCanvasImageNode(node) && node.data.inpaint;
    const masked = Boolean(inpaint) || inputs.some(edge => edge.targetHandle === 'mask');
    const images = inputs.filter(edge => /^image-\d+$/.test(edge.targetHandle ?? ''));
    if (sunburst) {
      const settings = knownSettings(sunburst, { ...defaultSunburstSettings, ...sunburstParameterDefaults });
      // A model-produced channel choice is unknown until execution. Use the
      // broader capabilities here, then validate its real value before submit.
      if (unknown.has('channelModel') && settings.provider === 'apimart') settings.channelModel = 'gpt-image-2.6';
      const validated = validateSunburstSettings(settings);
      if (edit?.markupMarks) validateSunburstMarkup(validated.outputFormat, true, masked);
      validateSunburstImageInputs(String(settings.outputFormat), Boolean(inpaint || edit?.original || images.length), masked, validateSunburstProvider(settings.provider), validated.channelModel);
      if (masked && !inpaint && !images.length) throw new Error('使用 Mask 时必须连接 Image。');
    } else if (model.type === 'seedream') {
      validateSeedreamSettings(knownSettings({ ...model.data, size: model.data.size ?? 'auto' }, defaultSeedreamSettings));
    } else if (model.type === 'nano-banana') {
      validateNanoBananaSettings(knownSettings(model.data, defaultNanoBananaSettings));
    }
  } catch (error) { nodeProblem(node, error instanceof Error ? error.message : '输入参数无效。'); }
}

export function preflight(graph: ExecutionGraph, targets: string[], runs: number) {
  const maxRuns = targets.length === 1 && graph.nodes.some(node => node.id === targets[0] && node.type === 'sunburst' && 'composer' in node.data && node.data.composer) ? 20 : 10;
  if (!Number.isInteger(runs) || runs < 1 || runs > maxRuns) throw new Error(`运行次数必须为 1–${maxRuns}。`);
  const dependencies = new Map<string, Set<string>>();
  for (const target of targets) {
    const all = new Set<string>();
    const visit = (id: string, handle?: string | null, path = new Set<string>()) => {
      const node = graph.nodes.find(item => item.id === id);
      if (!node) throw new ExecutionProblem(id, '连接的节点不存在。');
      const key = `${id}:${handle ?? ''}`;
      if (path.has(key)) nodeProblem(node, '检测到循环依赖。');
      if (all.has(key)) return;
      all.add(key);
      if (storedAnnotationResult(node, handle, graph.nodes, graph.edges)) return;
      if (!targets.includes(id) && fixedOutput(node, graph)) return;
      if (graph.existingImagesOnly && !targets.includes(id) && isModelNode(node)) nodeProblem(node, '参考图片尚未就绪。');

      if (id === target && (!isModelNode(node) || isNodeLocked(node))) nodeProblem(node, '节点已锁定或不能运行。');
      if (isImportedCanvasImage(node)) nodeProblem(node, '请替换无法读取的导入图片。');

      if (node.type === 'file' && !fileAssets(node.data).some(asset => asset.kind === 'image')) nodeProblem(node, '请先上传图片。');
      const inputs = executionInputs(node, handle, graph);

      if (isImageGeneratorNode(node) && !(node.type === 'sunburst' && node.data.composer?.prompt.trim()) && !inputs.some(edge => edge.targetHandle === 'prompt')) nodeProblem(node, '请连接提示词。');

      for (const edge of inputs) {
        const source = graph.nodes.find(item => item.id === edge.source);
        const valid = isAnnotationInput(edge.targetHandle)
          ? annotationOutput(source, edge.sourceHandle, graph.nodes, graph.edges)
          : pinnedResultAsset(source, edge.sourceHandle) || outputKind(source, edge.sourceHandle);
        if (!valid) nodeProblem(node, '连接的输出端口无效。');
        visit(edge.source, edge.sourceHandle, new Set(path).add(key));
      }
      if (isModelNode(node)) validateKnownModelInputs(node, graph, targets);
    };
    visit(target);
    dependencies.set(target, all);
  }
  if (runs > 1 && targets.some(target => targets.some(other => other !== target && [...dependencies.get(other)!].some(key => key.startsWith(`${target}:`))))) throw new Error('互有依赖的多选节点暂不支持多次运行，请只选择最终目标。');
  return dependencies;
}
