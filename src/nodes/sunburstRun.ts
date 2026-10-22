import { invertRevision } from './invert.ts';
import { isInvertNode } from './types.ts';
import { levelsRevision } from './levels.ts';
import { isLevelsNode } from './types.ts';
import { blurRevision } from './blur.ts';
import { isBlurNode } from './types.ts';
import { colorRevision } from './colorCorrection.ts';
import { cropRevision } from './crop.ts';
import { isColorCorrectionNode, isCropNode, isPainterNode } from './types.ts';
import { painterRevision } from './painter.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, SunburstNode } from './types';
import { isNodeLocked, isSunburstNode } from './types.ts';
import { fileAssets } from './fileCollection.ts';
import { resolveTextValue } from './textVariables.ts';
import { sunburstModel, validateSunburstSettings } from './sunburst.ts';
import type { PreviewTask } from './taskQueue';

export function imageOutput(node: AppNode | undefined, handle?: string | null, nodes?: AppNode[], edges?: Edge[], visited = new Set<string>()): FileAsset[] {
  if (isInvertNode(node)) {
    if (handle !== 'result' || visited.has(node.id)) return [];
    visited.add(node.id);
    if (nodes && edges) {
      const edge = edges.find(item => item.target === node.id && item.targetHandle === 'image');
      const source = edge ? imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges, visited)[0] : node.data.baseImage;
      if (!source || node.data.outputRevision !== invertRevision(source.id)) return [];
    }
    return node.data.result ? [node.data.result] : [];
  }
  if (isLevelsNode(node)) {
    if (handle !== 'result' || visited.has(node.id)) return [];
    visited.add(node.id);
    if (nodes && edges) {
      const edge = edges.find(item => item.target === node.id && item.targetHandle === 'image');
      const source = edge ? imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges, visited)[0] : node.data.baseImage;
      if (!source || node.data.outputRevision !== levelsRevision(node.data, source.id)) return [];
    }
    return node.data.result ? [node.data.result] : [];
  }
  if (isBlurNode(node)) {
    if (handle !== 'result' || visited.has(node.id)) return [];
    visited.add(node.id);
    if (nodes && edges) {
      const edge = edges.find(item => item.target === node.id && item.targetHandle === 'image');
      const source = edge ? imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges, visited)[0] : node.data.baseImage;
      if (!source || node.data.outputRevision !== blurRevision(node.data, source.id)) return [];
    }
    return node.data.result ? [node.data.result] : [];
  }
  if (isColorCorrectionNode(node)) {
    if (handle !== 'result' || visited.has(node.id)) return [];
    visited.add(node.id);
    if (nodes && edges) {
      const edge = edges.find(item => item.target === node.id && item.targetHandle === 'file');
      const source = edge ? imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges, visited)[0] : node.data.baseImage;
      if (!source || node.data.outputRevision !== colorRevision(node.data, source.id)) return [];
    }
    return node.data.result ? [node.data.result] : [];
  }
  if (isCropNode(node)) {
    if (visited.has(node.id)) return [];
    visited.add(node.id);
    if (nodes && edges) {
      const edge = edges.find(item => item.target === node.id && item.targetHandle === 'image');
      const source = edge ? imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges, visited)[0] : node.data.baseImage;
      if (!source || node.data.outputRevision !== cropRevision(node.data, source.id)) return [];
    }
    return node.data.result ? [node.data.result] : [];
  }
  if (isPainterNode(node)) {
    if (visited.has(node.id)) return [];
    visited.add(node.id);
    if (nodes && edges) {
      const edge = edges.find(item => item.target === node.id && item.targetHandle === 'image');
      const source = edge ? imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges, visited)[0] : node.data.baseImage;
      if ((edge && !source) || node.data.outputRevision !== painterRevision(node.data, source?.id ?? '')) return [];
    }
    const asset = handle === 'mask' ? node.data.mask : handle === 'alpha-mask' ? node.data.alphaMask : node.data.result;
    return asset ? [asset] : [];
  }
  if (node?.type === 'file') return fileAssets(node.data).filter(asset => asset.kind === 'image');
  if (node && isSunburstNode(node)) {
    const results = node.data.results ?? [];
    const active = results.find(asset => asset.id === node.data.activeResultId) ?? results[results.length - 1];
    return active ? [active] : [];
  }
  return [];
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
      if (maskEdge) {
        const source = nodes.find(item => item.id === maskEdge.source);
        const assets = imageOutput(source, source?.type === 'painter' && maskEdge.sourceHandle === 'mask' ? 'alpha-mask' : maskEdge.sourceHandle, nodes, edges);
        if (assets.length !== 1) throw new Error('Mask 必须连接一张 PNG 图片。');
        if (!images.length) throw new Error('使用 Mask 时必须连接 Image。');
        mask = assets[0].url;
      }
      for (let index = 0; index < runs; index++) tasks.push({ id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model: sunburstModel, imageRequest: { ...settings, prompt, images, mask }, progress: 0, state: 'Queued', started: 0 });
    }
    return { tasks };
  } catch (error) { return { tasks: [], error: error instanceof Error ? error.message : '输入参数无效。' }; }
}
