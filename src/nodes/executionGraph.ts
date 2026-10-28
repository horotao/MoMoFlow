import { imageIterationSignature, validateImageIteratorAssets } from './imageIterator.ts';
import { sameIteration, type WorkflowIteration } from './workflowIteration.ts';
import { taskAssetUrls } from './assetResources.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { isTextNode, iteratorItems } from './textVariables.ts';
import { isImageIteratorNode, isTextIteratorNode } from './types.ts';
import { validateIteratorItems } from './textIterator.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset } from './types';
import { isDescriberNode, isImageGeneratorNode, isNodeLocked, isCompositorNode, isMasksExtractorNode, isCompareNode, isBlendNode } from './types.ts';
import { hasVariable } from './textDocument.ts';
import { fileAssets, orderedAssets } from './fileCollection.ts';
import { imageOutput } from './sunburstRun.ts';
import { defaultSunburstSettings, validateSunburstSettings } from './sunburst.ts';
import { defaultNanoBananaSettings, validateNanoBananaSettings } from './nanoBanana.ts';
import { resolveTextValue } from './textVariables.ts';
import { effectiveSunburstSettings, prepareSunburstRun } from './sunburstRun.ts';
import { prepareDescriberRun } from './describerRun.ts';
import { effectiveNanoBananaSettings, prepareNanoBananaRun } from './nanoBananaRun.ts';
import { effectiveIdeogramSettings, prepareIdeogramRun } from './ideogramRun.ts';
import { defaultIdeogramSettings, defaultIdeogramEditSettings, validateIdeogramSettings, validateIdeogramEditSettings, validateIdeogramPrompt, ideogramEditFields, ideogramGenerationFields } from './ideogram.ts';
import { outputKind } from './router.ts';
import type { PreviewTask } from './taskQueue';

export type ExecutionGraph = { nodes: AppNode[]; edges: Edge[] };
export type GenerationRecord = { version: 1; inputSignature: string; outputSignature: string; iteration?: WorkflowIteration };
export type OutputPolicy = { outputMode?: 'manual' | 'fixed'; sourceSignature?: string };
export const isModelNode = (node: AppNode) => isDescriberNode(node) || isImageGeneratorNode(node);
export const stableSignature = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
  if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  return item;
});
export function selectedResult(node: AppNode) {
  if (!isImageGeneratorNode(node)) return undefined;
  return node.data.results?.find(asset => asset.id === node.data.activeResultId) ?? node.data.results?.[node.data.results.length - 1];
}
export function fixedOutput(node: AppNode) {
  return isDescriberNode(node) ? node.data.outputMode === 'manual' && Boolean(node.data.text.trim())
    : isImageGeneratorNode(node) && node.data.outputMode === 'fixed' && Boolean(selectedResult(node));
}
export function executionInputs(node: AppNode, handle: string | null | undefined, graph: ExecutionGraph): Edge[] {
  const edges = graph.edges.filter(edge => edge.target === node.id);
  if (node.type === 'router') return edges.filter(edge => edge.targetHandle === 'input');
  if (node.type === 'text-iterator') return edges.filter(edge => edge.targetHandle === 'input');
  if (node.type === 'compare') return edges.filter(edge => edge.targetHandle === (handle === 'output-2' ? 'input-2' : 'input-1'));
  if (isTextNode(node) && node.data.content) return edges.filter(edge => hasVariable(node.data.content!, edge.targetHandle ?? 'variable-1'));
  if (node.type === 'model-input' || node.type === 'image-iterator' || node.type === 'file' || node.type === 'color-palette') return [];
  if (node.type === 'ideogram') {
    const edit = edges.some(edge => edge.targetHandle === 'image-0');
    const fields: readonly string[] = edit ? ideogramEditFields : ideogramGenerationFields;
    return edges.filter(edge => edge.targetHandle === 'prompt' || edge.targetHandle === 'mask' || /^image-\d+$/.test(edge.targetHandle ?? '') || fields.includes(edge.targetHandle ?? ''));
  }
  if (isCompositorNode(node)) {
    const handles = new Set(node.data.document.layers.filter(layer => layer.visible || (node.data.document.canvas.autoSize && layer.source.kind === 'input' && layer.source.handle === 'background'))
      .flatMap(layer => layer.source.kind === 'input' ? [layer.source.handle] : []));
    return edges.filter(edge => handles.has(edge.targetHandle ?? ''));
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
    if (!targets.includes(id) && fixedOutput(node)) { add(selectedResult(node)); return; }
    const inputs = executionInputs(node, handle, graph);
    const connected = (port: string) => inputs.some(edge => edge.targetHandle === port);
    if (node.type === 'file') fileAssets(node.data).forEach(add);
    else if (isCompareNode(node)) {
      const second = handle === 'output-2';
      if (!connected(second ? 'input-2' : 'input-1')) add(second ? node.data.input2 : node.data.input1);
    } else if (isBlendNode(node)) {
      if (!connected('back')) add(node.data.back);
      if (!connected('front')) add(node.data.front);
    } else if (isCompositorNode(node)) {
      for (const layer of node.data.document.layers) {
        if (!layer.visible && !(node.data.document.canvas.autoSize && layer.source.kind === 'input' && layer.source.handle === 'background')) continue;
        if (layer.source.kind === 'asset') add(layer.source.asset);
        else if (layer.source.kind === 'input' && !connected(layer.source.handle)) add(layer.source.fallback);
      }
    } else if ('baseImage' in node.data && !connected(node.type === 'color-correction' ? 'file' : 'image')) add(node.data.baseImage as FileAsset | undefined);
    inputs.forEach(edge => visit(edge.source, edge.sourceHandle));
  };
  visit(target);
  return [...assets.values()];
}
export class ExecutionProblem extends Error {
  nodeId: string;
  constructor(nodeId: string, message: string) { super(message); this.nodeId = nodeId; }
}
export function nodeProblem(node: AppNode, message: string): never {
  throw new ExecutionProblem(node.id, `${node.data.label || node.type}：${message}`);
}

// Output content is part of the edit guard, but derived local renders are not.
// The runtime advances this guard itself when it commits an accepted result.
function configuration(node: AppNode, graph: ExecutionGraph, handle?: string | null) {
  const data = { ...node.data } as Record<string, unknown>;
  for (const key of ['label', 'exposed', 'imageInputs', 'variableCount', 'displayMode', 'orderBy', 'viewMode', 'generation', 'sourceSignature', 'outputRevision', 'executionSignature', 'result', 'mask', 'alphaMask']) delete data[key];
  if (node.type === 'image-iterator') return { locked: data.locked, assets: orderedAssets(node.data).map(assetIdentity) };
  if (node.type === 'file') return { locked: data.locked, assets: fileAssets(node.data).map(assetIdentity) };
  if (isImageGeneratorNode(node)) {
    delete data.results;
    const result = selectedResult(node);
    data.activeResult = result ? { resultId: result.id, ...assetIdentity(result) } : undefined;
  }
  if (node.type === 'ideogram') {
    const edit = graph.edges.some(edge => edge.target === node.id && edge.targetHandle === 'image-0');
    for (const field of edit ? ideogramGenerationFields : ideogramEditFields) delete data[field];
  }
  if (node.type === 'compare') return { locked: data.locked, input: handle === 'output-2' ? data.input2 : data.input1 };
  if (isTextNode(node) && node.data.content) delete data.text;
  for (const edge of executionInputs(node, handle, graph)) if (edge.targetHandle && ['model', 'instructions', 'quality', 'background', 'size', 'outputFormat', 'aspectRatio', 'imageSize', 'resolution', 'enablePromptExpansion', 'editQuality', 'editPrecision', 'editSize'].includes(edge.targetHandle)) delete data[edge.targetHandle];
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
    if (!forced && fixedOutput(node)) {
      records.set(key, [node.type, isDescriberNode(node) ? node.data.text : assetIdentity(selectedResult(node)!), 'outputMode' in node.data ? node.data.outputMode : undefined]);
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
export function sourceSignature(graph: ExecutionGraph, node: AppNode) {
  // Keep the manually edited output out of its own source marker.
  const replacement: AppNode = isDescriberNode(node) ? { ...node, data: { ...node.data, text: '', outputMode: undefined, sourceSignature: undefined } } : isImageGeneratorNode(node) ? { ...node, data: { ...node.data, results: [], activeResultId: undefined, outputMode: undefined, sourceSignature: undefined } } as AppNode : node;
  return graphGuard({ ...graph, nodes: graph.nodes.map(item => item.id === node.id ? replacement : item) }, node.id, true);
}
export function prepareModel(graph: ExecutionGraph, id: string): PreviewTask {
  const node = graph.nodes.find(item => item.id === id);
  if (!node) throw new ExecutionProblem(id, '节点已删除。');
  const prepare = node.type === 'image-describer' ? prepareDescriberRun : node.type === 'sunburst' ? prepareSunburstRun : node.type === 'nano-banana' ? prepareNanoBananaRun : prepareIdeogramRun;
  const result = prepare(graph.nodes, graph.edges, [id], 1);
  if (result.error || !result.tasks[0]) nodeProblem(node, result.error ?? '节点已锁定或不能运行。');
  if (node.type === 'image-describer' && result.tasks[0].model !== 'deepseek-flash') nodeProblem(node, '请选择 deepseek-flash；其他模型尚未接入。');
  // Unlike the legacy describer validator, every connected input must be ready.
  for (const edge of executionInputs(node, undefined, graph).filter(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))) {
    if (!imageOutput(graph.nodes.find(item => item.id === edge.source), edge.sourceHandle, graph.nodes, graph.edges).length) nodeProblem(node, '连接的图片尚未准备完成。');
  }
  return result.tasks[0];
}
export function requestSignature(task: PreviewTask, graph: ExecutionGraph) {
  const assets = new Map<string, ReturnType<typeof assetIdentity>>();
  const requested = new Set(taskAssetUrls(task));
  mapAssets(graph.nodes, asset => { assets.set(asset.url, assetIdentity(asset)); return asset; });
  // Local PNGs can be re-exported by previews with new asset IDs. Their stable
  // identity is the producing configuration and source lineage, not that export.
  for (const node of graph.nodes) if (!isModelNode(node) && node.type !== 'file') {
    for (const field of ['result', 'mask', 'alphaMask'] as const) {
      const asset = field in node.data ? (node.data as Record<string, unknown>)[field] as FileAsset | undefined : undefined;
      if (asset && requested.has(asset.url)) assets.set(asset.url, { id: stableSignature(['local-output-v1', field, graphGuard(graph, node.id, false, field === 'result' ? 'result' : 'mask')]), maskMode: asset.maskMode, remote: undefined });
    }
  }
  const replace = (value: unknown): unknown => typeof value === 'string' && assets.has(value) ? assets.get(value)
    : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)])) : value;
  return stableSignature(['model-input-v1', task.model, replace(task.imageRequest ?? task.nanoBananaRequest ?? task.ideogramRequest ?? { instructions: task.instructions, images: task.images })]);
}
export function reusable(node: AppNode, signature: string) {
  if (isDescriberNode(node)) return Boolean(node.data.text.trim() && node.data.generation?.version === 1 && node.data.generation.inputSignature === signature && node.data.generation.outputSignature === stableSignature(node.data.text));
  const asset = selectedResult(node);
  return Boolean(asset?.generation?.version === 1 && asset.generation.inputSignature === signature && asset.generation.outputSignature === asset.id);
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
    if (isModelNode(source)) return targets.includes(id) || !fixedOutput(source);
    return executionInputs(source, handle, graph).some(edge => dynamic(edge.source, edge.sourceHandle, seen));
  };
  const inputs = executionInputs(node, undefined, graph);
  const unknown = new Set(inputs.filter(edge => dynamic(edge.source, edge.sourceHandle)).map(edge => edge.targetHandle));
  const knownSettings = (values: Record<string, unknown>, defaults: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, unknown.has(key) ? defaults[key] : value]));
  try {
    if (isDescriberNode(node)) {
      const edge = inputs.find(edge => edge.targetHandle === 'model');
      const model = edge ? resolveTextValue(edge.source, graph.nodes, graph.edges) : node.data.model;
      if (!unknown.has('model') && model !== 'deepseek-flash') throw new Error('请选择 deepseek-flash；其他模型尚未接入。');
      return;
    }
    if (!isImageGeneratorNode(node)) return;
    const promptEdge = inputs.find(edge => edge.targetHandle === 'prompt');
    if (!unknown.has('prompt')) {
      const prompt = promptEdge ? resolveTextValue(promptEdge.source, graph.nodes, graph.edges).trim() : '';
      if (node.type === 'ideogram') validateIdeogramPrompt(prompt);
      else if (!prompt || prompt.length > 32000) throw new Error('请连接非空提示词，最多 32000 个字符。');
    }
    const masked = inputs.some(edge => edge.targetHandle === 'mask');
    const images = inputs.filter(edge => /^image-\d+$/.test(edge.targetHandle ?? ''));
    if (node.type === 'sunburst') {
      validateSunburstSettings(knownSettings(effectiveSunburstSettings(node, graph.nodes, graph.edges), defaultSunburstSettings));
      if (masked && !images.length) throw new Error('使用 Mask 时必须连接 Image。');
    } else if (node.type === 'nano-banana') {
      validateNanoBananaSettings(knownSettings(effectiveNanoBananaSettings(node, graph.nodes, graph.edges), defaultNanoBananaSettings));
    } else if (node.type === 'ideogram') {
      const effective = knownSettings(effectiveIdeogramSettings(node, graph.nodes, graph.edges), { ...defaultIdeogramSettings, ...defaultIdeogramEditSettings });
      if (images.some(edge => edge.targetHandle === 'image-0')) {
        // Size is ignored in masked/high precision mode. If precision is dynamic,
        // the effective size cannot be decided until that text is available.
        validateIdeogramEditSettings({ ...effective, ...(masked || effective.editPrecision === 'high' || unknown.has('editPrecision') ? { editSize: 'auto' } : {}) }, masked);
      } else {
        if (masked || images.length) throw new Error('使用参考图或 Mask 时，必须将原图连接到 Image 输入。');
        validateIdeogramSettings(effective);
      }
    }
  } catch (error) { nodeProblem(node, error instanceof Error ? error.message : '输入参数无效。'); }
}

function preflightSingle(graph: ExecutionGraph, targets: string[], runs: number) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('运行次数必须为 1–10。');
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
      if (!targets.includes(id) && fixedOutput(node)) return;
      if (id === target && (!isModelNode(node) || isNodeLocked(node))) nodeProblem(node, '节点已锁定或不能运行。');
      if (isMasksExtractorNode(node)) {
        if (!node.data.selection) nodeProblem(node, '请先完成必要选区。');
        const edge = graph.edges.find(item => item.target === id && item.targetHandle === 'image');
        const input = edge ? imageOutput(graph.nodes.find(item => item.id === edge.source), edge.sourceHandle, graph.nodes, graph.edges)[0] : node.data.baseImage;
        if (input && node.data.selection?.inputId !== input.id) nodeProblem(node, '请为当前图片重新完成选区。');
      }
      if (node.type === 'file' && !fileAssets(node.data).some(asset => asset.kind === 'image')) nodeProblem(node, '请先上传图片。');
      const inputs = executionInputs(node, handle, graph);
      if (isDescriberNode(node) && !inputs.some(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))) nodeProblem(node, '请连接图片。');
      if (isImageGeneratorNode(node) && !inputs.some(edge => edge.targetHandle === 'prompt')) nodeProblem(node, '请连接提示词。');
      if (['resize', 'rotate-flip', 'invert', 'levels', 'blur', 'crop', 'color-correction', 'matte-grow-shrink', 'masks-extractor'].includes(node.type ?? '') && !inputs.length && !('baseImage' in node.data && node.data.baseImage)) nodeProblem(node, '请连接图片。');
      if (node.type === 'router' && !inputs.length) nodeProblem(node, '请连接输入。');
      for (const edge of inputs) {
        const source = graph.nodes.find(item => item.id === edge.source);
        if (!outputKind(source, edge.sourceHandle, graph.nodes, graph.edges)) nodeProblem(node, '连接的输出端口无效。');
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

// One iterator may fan out through any number of Prompt/Router/model nodes.
// Distinct iterator sources require a pairing policy; reject instead of silently
// multiplying paid requests or picking only the first source.
export function workflowIterations(graph: ExecutionGraph, target: string): (WorkflowIteration | undefined)[] {
  const iterators = new Set<string>(), seen = new Set<string>();
  const visit = (id: string, handle?: string | null) => {
    const key = `${id}:${handle ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const node = graph.nodes.find(item => item.id === id);
    if (!node || (id !== target && fixedOutput(node))) return;
    if (isTextIteratorNode(node) || isImageIteratorNode(node)) iterators.add(id);
    executionInputs(node, handle, graph).forEach(edge => visit(edge.source, edge.sourceHandle));
  };
  visit(target);
  if (!iterators.size) return [undefined];
  const node = graph.nodes.find(item => item.id === [...iterators][0])!;
  if (iterators.size > 1) nodeProblem(node, '同一条批量流程目前只能使用一个迭代器，请分开运行图片与文本列表。');
  if (isImageIteratorNode(node)) {
    const assets = orderedAssets(node.data);
    try { validateImageIteratorAssets(assets); } catch (error) { nodeProblem(node, error instanceof Error ? error.message : '图片列表无效。'); }
    return assets.map((asset, index) => ({ kind: 'image' as const, nodeId: node.id, itemId: asset.id, index, total: assets.length, name: asset.name, signature: imageIterationSignature(asset) }));
  }
  if (!isTextIteratorNode(node)) return [undefined];
  // The number of requests must be known before starting a batch. Fixed/manual
  // model text is allowed; an unfinished/generated list must first be confirmed.
  const checkInput = (id: string, path = new Set<string>()) => {
    if (path.has(id)) nodeProblem(node, '检测到循环依赖。');
    const input = graph.nodes.find(item => item.id === id);
    if (!input) nodeProblem(node, '连接的节点不存在。');
    if (fixedOutput(input)) return;
    if (isModelNode(input)) nodeProblem(node, '请先运行上游文本模型，并将列表设为手动文本后再批量运行。');
    executionInputs(input, undefined, graph).forEach(edge => checkInput(edge.source, new Set(path).add(id)));
  };
  executionInputs(node, undefined, graph).forEach(edge => {
    if (outputKind(graph.nodes.find(input => input.id === edge.source), edge.sourceHandle, graph.nodes, graph.edges) !== 'text') nodeProblem(node, '输入端口需要文本或文本数组。');
    checkInput(edge.source);
  });
  try {
    const items = iteratorItems(node, graph.nodes, graph.edges);
    validateIteratorItems(items);
    return items.map((item, index) => ({ nodeId: node.id, itemId: item.id, index, total: items.length, text: item.text }));
  } catch (error) { nodeProblem(node, error instanceof Error ? error.message : '文本列表无效。'); }
}

export function iterationGraph(graph: ExecutionGraph, iteration?: WorkflowIteration): ExecutionGraph {
  if (!iteration) return graph;
  if (iteration.kind === 'image') return {
    ...graph, nodes: graph.nodes.map(node => node.id === iteration.nodeId && isImageIteratorNode(node) ? {
      ...node, type: 'file', data: { ...node.data, asset: undefined, assets: fileAssets(node.data).filter(asset => asset.id === iteration.itemId) },
    } as AppNode : node),
  };
  return {
    nodes: graph.nodes.map(node => node.id === iteration.nodeId ? {
      ...node, type: 'text', data: { text: iteration.text, label: node.data.label, locked: isNodeLocked(node) },
    } as AppNode : node),
    edges: graph.edges.filter(edge => edge.target !== iteration.nodeId).map(edge => edge.source === iteration.nodeId ? { ...edge, sourceHandle: null } : edge),
  };
}

export function planExecution(graph: ExecutionGraph, targets: string[], runs: number, retry?: WorkflowIteration) {
  // Validate every known item before any task or provider request is created.
  const plans = new Map(targets.map(id => [id, workflowIterations(graph, id)]));
  if (!retry && [...plans.values()].every(iterations => !iterations[0])) {
    preflightSingle(graph, targets, runs);
    return plans;
  }
  for (const id of targets) {
    let iterations = plans.get(id)!;
    if (retry) {
      iterations = iterations.filter(item => item && sameIteration(item, retry));
      if (!iterations.length) throw new ExecutionProblem(retry.nodeId, '原条目已修改或删除，请检查列表后重新运行。');
      plans.set(id, iterations);
    }
    for (const iteration of iterations) preflightSingle(iterationGraph(graph, iteration), [id], runs);
  }
  // Preserve the existing dependent-selection policy, also for iterator batches.
  for (const id of targets) {
    const dependencies = preflightSingle(iterationGraph(graph, plans.get(id)![0]), [id], runs).get(id)!;
    if (targets.some(other => other !== id && (plans.get(id)![0] || plans.get(other)![0] || runs > 1) && [...dependencies].some(key => key.startsWith(`${other}:`)))) {
      throw new ExecutionProblem(id, '互有依赖的批量节点请只选择最终目标运行。');
    }
  }
  return plans;
}

// Retain the dependency-inspection contract used by existing callers.
export function preflight(graph: ExecutionGraph, targets: string[], runs: number) {
  const plan = planExecution(graph, targets, runs);
  return new Map(targets.map(id => [id, new Set(plan.get(id)!.flatMap(iteration => [...preflightSingle(iterationGraph(graph, iteration), [id], runs).get(id)!]))]));
}
