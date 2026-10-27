import { masksRevision } from './masksExtractor.ts';
import { isMasksExtractorNode } from './types.ts';
import { resolveOutputSource, outputKind } from './router.ts';
import { blendRevision } from './blend.ts';
import { isBlendNode, type BlendNode } from './types.ts';
import { compareInput } from './compare.ts';
import { isCompareNode } from './types.ts';
import { resizeRevision } from './resize.ts';
import { isResizeNode } from './types.ts';
import { paletteRevision } from './colorPalette.ts';
import { isColorPaletteNode } from './types.ts';
import { compositorPending, compositorRevision, type CompositorInputs } from './compositor.ts';
import { isCompositorNode } from './types.ts';
import { rotateFlipRevision } from './rotateFlip.ts';
import { isRotateFlipNode } from './types.ts';
import { invertRevision } from './invert.ts';
import { isInvertNode } from './types.ts';
import { levelsRevision } from './levels.ts';
import { isLevelsNode } from './types.ts';
import { matteGrowShrinkRevision } from './matteGrowShrink.ts';
import { isMatteGrowShrinkNode } from './types.ts';
import { blurRevision } from './blur.ts';
import { isBlurNode } from './types.ts';
import { colorRevision } from './colorCorrection.ts';
import { cropRevision } from './crop.ts';
import { isColorCorrectionNode, isCropNode, isPainterNode } from './types.ts';
import { painterRevision } from './painter.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, SunburstNode } from './types';
import { isNodeLocked, isSunburstNode, isImageGeneratorNode } from './types.ts';
import { fileAssets } from './fileCollection.ts';
import { resolveTextValue } from './textVariables.ts';
import { sunburstModel, validateSunburstSettings } from './sunburst.ts';
import type { SunburstRequest } from './sunburst';
import type { PreviewTask } from './taskQueue';

function luminanceMaskOutput(asset: FileAsset | undefined): FileAsset[] {
  // Carry white = edit semantics on the asset so Compare, Router and snapshots
  // preserve them. Enrich old saved outputs without mutating their source data.
  return asset ? [asset.maskMode === 'luminance' ? asset : { ...asset, maskMode: 'luminance' }] : [];
}

// The cache belongs to one synchronous graph read. Never reuse it after edits,
// undo, reconnection or IndexedDB restore; each of those must recheck revisions.
function imageResolution(nodes?: AppNode[], edges?: Edge[], visited = new Set<string>()) {
  const hasGraph = Boolean(nodes && edges);
  const nodeById = new Map(nodes?.map(node => [node.id, node]));
  const incoming = new Map<string, Edge[]>();
  for (const edge of edges ?? []) {
    const inputs = incoming.get(edge.target) ?? [];
    inputs.push(edge); incoming.set(edge.target, inputs);
  }
  const outputs = new Map<string, Map<string | null | undefined, FileAsset[]>>();
  const active = new Set(visited);
  let cycles = 0;
  const resolve = (node: AppNode | undefined, handle?: string | null): FileAsset[] => {
    if (!node) return [];
    // Only the current path is a cycle. Sibling ports may share any upstream.
    if (active.has(node.id)) { cycles++; return []; }
    const cached = outputs.get(node.id)?.get(handle);
    if (cached) return cached;
    active.add(node.id);
    const before = cycles;
    try {
      const result = evaluate(node, handle);
      // A cycle-truncated result can depend on the path that reached it.
      if (cycles === before) {
        const ports = outputs.get(node.id) ?? new Map();
        ports.set(handle, result); outputs.set(node.id, ports);
      }
      return result;
    } finally { active.delete(node.id); }
  };
  const resolveInputs = (id: string): CompositorInputs => {
    const result: CompositorInputs = {};
    for (const edge of incoming.get(id) ?? []) if (edge.targetHandle) {
      result[edge.targetHandle] = { connected: true, asset: resolve(nodeById.get(edge.source), edge.sourceHandle)[0] };
    }
    return result;
  };
  const evaluate = (node: AppNode, handle?: string | null): FileAsset[] => {
    if (node.type === 'router') {
      if (handle !== 'output' || !['image', 'mask'].includes(outputKind(node, handle, nodes, edges) ?? '')) return [];
      const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'input');
      return edge ? resolve(nodeById.get(edge.source), edge.sourceHandle) : [];
    }
    if (isBlendNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const inputs = resolveInputs(node.id);
        const back = inputs.back?.connected ? inputs.back.asset : node.data.back;
        const front = inputs.front?.connected ? inputs.front.asset : node.data.front;
        if ((inputs.back?.connected && !back) || (inputs.front?.connected && !front) || (!back && !front)
          || node.data.outputRevision !== blendRevision(node.data.settings, back, front)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isCompareNode(node)) {
      const input = compareInput(handle);
      if (!input) return [];
      const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === input);
      if (edge) return resolve(nodeById.get(edge.source), edge.sourceHandle).slice(0, 1);
      const asset = input === 'input-1' ? node.data.input1 : node.data.input2;
      return asset ? [asset] : [];
    }
    if (isColorPaletteNode(node)) {
      return handle === 'image' && node.data.colors.length && node.data.result && node.data.outputRevision === paletteRevision(node.data.colors) ? [node.data.result] : [];
    }
    if (isCompositorNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const inputs = resolveInputs(node.id);
        if (compositorPending(node.data.document, inputs) || node.data.outputRevision !== compositorRevision(node.data.document, inputs)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isResizeNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== resizeRevision(node.data, source.id)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isRotateFlipNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== rotateFlipRevision(node.data, source.id)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isInvertNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== invertRevision(source.id)) return [];
      }
      return luminanceMaskOutput(node.data.result);
    }
    if (isLevelsNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== levelsRevision(node.data, source.id)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isMatteGrowShrinkNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== matteGrowShrinkRevision(node.data, source.id)) return [];
      }
      return luminanceMaskOutput(node.data.result);
    }
    if (isBlurNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== blurRevision(node.data, source.id)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isColorCorrectionNode(node)) {
      if (handle !== 'result') return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'file');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== colorRevision(node.data, source.id)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isCropNode(node)) {
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if (!source || node.data.outputRevision !== cropRevision(node.data, source.id)) return [];
      }
      return node.data.result ? [node.data.result] : [];
    }
    if (isMasksExtractorNode(node)) {
      if (!['result', 'mask'].includes(handle ?? '') || !node.data.selection) return [];
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        const revision = source && masksRevision(node.data, source.id);
        if (!revision || node.data.outputRevision !== revision) return [];
      }
      const asset = handle === 'mask' ? node.data.mask : node.data.result;
      return handle === 'mask' ? luminanceMaskOutput(asset) : asset ? [asset] : [];
    }
    if (isPainterNode(node)) {
      if (hasGraph) {
        const edge = (incoming.get(node.id) ?? []).find(item => item.targetHandle === 'image');
        const source = edge ? resolve(nodeById.get(edge.source), edge.sourceHandle)[0] : node.data.baseImage;
        if ((edge && !source) || node.data.outputRevision !== painterRevision(node.data, source?.id ?? '')) return [];
      }
      const asset = handle === 'mask' ? node.data.mask : handle === 'alpha-mask' ? node.data.alphaMask : node.data.result;
      return handle === 'mask' ? luminanceMaskOutput(asset) : asset ? [asset] : [];
    }
    if (node?.type === 'file') return fileAssets(node.data).filter(asset => asset.kind === 'image');
    if (node && isImageGeneratorNode(node)) {
      const results = node.data.results ?? [];
      const active = results.find(asset => asset.id === node.data.activeResultId) ?? results[results.length - 1];
      return active ? [active] : [];
    }
    return [];
  };
  return { output: resolve, inputs: resolveInputs };
}

export function imageOutput(node: AppNode | undefined, handle?: string | null, nodes?: AppNode[], edges?: Edge[], visited = new Set<string>()): FileAsset[] {
  return imageResolution(nodes, edges, visited).output(node, handle);
}

export function effectiveSunburstSettings(node: SunburstNode, nodes: AppNode[], edges: Edge[]) {
  return Object.fromEntries(Object.entries(node.data).filter(([field]) => ['quality', 'background', 'size', 'outputFormat'].includes(field)).map(([field, value]) => {
    const edge = edges.find(item => item.target === node.id && item.targetHandle === field);
    return [field, edge ? resolveTextValue(edge.source, nodes, edges).trim() : value];
  }));
}

export function prepareSunburstRun(nodes: AppNode[], edges: Edge[], ids: string[], runs: number): { tasks: PreviewTask[]; error?: string } {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) return { tasks: [], error: 'Runs 必须为 1–10。' };
  const tasks: PreviewTask[] = []; const batchId = crypto.randomUUID(); const createdAt = Date.now();
  try {
    for (const id of new Set(ids)) {
      const node = nodes.find(item => item.id === id);
      if (!node || !isSunburstNode(node) || isNodeLocked(node)) continue;
      const settings = validateSunburstSettings(effectiveSunburstSettings(node, nodes, edges));
      const inputs = edges.filter(edge => edge.target === id);
      const promptEdge = inputs.find(edge => edge.targetHandle === 'prompt');
      const prompt = promptEdge ? resolveTextValue(promptEdge.source, nodes, edges).trim() : '';
      if (!prompt || prompt.length > 32000) throw new Error('请为每个选中节点连接非空 Prompt，最多 32000 个字符。');
      const imageEdges = inputs.filter(edge => edge.targetHandle?.startsWith('image-')).sort((a, b) => Number(a.targetHandle?.slice(6)) - Number(b.targetHandle?.slice(6)));
      const images = imageEdges.flatMap(edge => {
        const assets = imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges);
        if (!assets.length) throw new Error('连接的 Image 尚无图片，请先上传图片或运行上游节点。');
        return assets.map(asset => asset.url);
      });
      if (images.length > 16) throw new Error('最多支持 16 张参考图片。');
      const maskEdge = inputs.find(edge => edge.targetHandle === 'mask');
      let mask: string | undefined;
      let maskMode: SunburstRequest['maskMode'];
      if (maskEdge) {
        const origin = resolveOutputSource(nodes.find(item => item.id === maskEdge.source), maskEdge.sourceHandle, nodes, edges);
        const source = origin?.node;
        const assets = imageOutput(source, source?.type === 'painter' && origin?.handle === 'mask' ? 'alpha-mask' : origin?.handle, nodes, edges);
        if (assets.length !== 1) throw new Error('Mask 必须连接一张 PNG 图片。');
        if (!images.length) throw new Error('使用 Mask 时必须连接 Image。');
        mask = assets[0].url;
        if (assets[0].maskMode === 'luminance' || isMatteGrowShrinkNode(source) || isInvertNode(source) || (isMasksExtractorNode(source) && origin?.handle === 'mask')) maskMode = 'luminance';
      }
      for (let index = 0; index < runs; index++) tasks.push({ id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model: sunburstModel, imageRequest: { ...settings, prompt, images, mask, ...(maskMode ? { maskMode } : {}) }, progress: 0, state: 'Queued', started: 0 });
    }
    return { tasks };
  } catch (error) { return { tasks: [], error: error instanceof Error ? error.message : '输入参数无效。' }; }
}

// Share validated outputs across every layer port, with a separate path guard.
export function compositorInputs(id: string, nodes: AppNode[], edges: Edge[], visited = new Set([id])): CompositorInputs {
  return imageResolution(nodes, edges, visited).inputs(id);
}

export function blendInputs(node: Pick<BlendNode, 'id' | 'data'>, nodes: AppNode[], edges: Edge[]) {
  const inputs = compositorInputs(node.id, nodes, edges);
  const back = inputs.back?.connected ? inputs.back.asset : node.data.back;
  const front = inputs.front?.connected ? inputs.front.asset : node.data.front;
  return { back, front, pending: Boolean((inputs.back?.connected && !back) || (inputs.front?.connected && !front)) };
}
