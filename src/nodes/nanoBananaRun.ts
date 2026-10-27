import type { Edge } from '@xyflow/react';
import type { AppNode, NanoBananaNode } from './types';
import { isNanoBananaNode, isNodeLocked } from './types.ts';
import { nanoBananaChoices, nanoBananaMaxImages, nanoBananaModel, validateNanoBananaSettings } from './nanoBanana.ts';
import { imageOutput } from './sunburstRun.ts';
import { resolveTextValue } from './textVariables.ts';
import type { PreviewTask } from './taskQueue';

export function effectiveNanoBananaSettings(node: NanoBananaNode, nodes: AppNode[], edges: Edge[]) {
  return Object.fromEntries(Object.keys(nanoBananaChoices).map(field => {
    const edge = edges.find(item => item.target === node.id && item.targetHandle === field);
    return [field, edge ? resolveTextValue(edge.source, nodes, edges).trim() : node.data[field as keyof typeof nanoBananaChoices]];
  }));
}

export function prepareNanoBananaRun(nodes: AppNode[], edges: Edge[], ids: string[], runs: number): { tasks: PreviewTask[]; error?: string } {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) return { tasks: [], error: '运行次数必须为 1–10。' };
  const tasks: PreviewTask[] = [], batchId = crypto.randomUUID(), createdAt = Date.now();
  try {
    for (const id of new Set(ids)) {
      const node = nodes.find(item => item.id === id);
      if (!node || !isNanoBananaNode(node) || isNodeLocked(node)) continue;
      const settings = validateNanoBananaSettings(effectiveNanoBananaSettings(node, nodes, edges));
      const inputs = edges.filter(edge => edge.target === id);
      const promptEdge = inputs.find(edge => edge.targetHandle === 'prompt');
      const prompt = promptEdge ? resolveTextValue(promptEdge.source, nodes, edges).trim() : '';
      if (!prompt || prompt.length > 32000) throw new Error('请为 Nano Banana 连接非空提示词，最多 32000 个字符。');
      const images = inputs.filter(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))
        .sort((a, b) => Number(a.targetHandle?.slice(6)) - Number(b.targetHandle?.slice(6)))
        .flatMap(edge => {
          if (Number(edge.targetHandle?.slice(6)) >= node.data.imageInputs) throw new Error('参考图端口不存在。');
          const assets = imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges);
          if (!assets.length) throw new Error('连接的 Image 尚无图片，请先上传图片或运行上游节点。');
          return assets.map(asset => asset.url);
        });
      if (images.length > nanoBananaMaxImages) throw new Error(`最多支持 ${nanoBananaMaxImages} 张参考图片。`);
      for (let index = 0; index < runs; index++) tasks.push({
        id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model: nanoBananaModel,
        nanoBananaRequest: { ...settings, prompt, images: [...images] }, progress: 0, state: 'Queued', started: 0,
      });
    }
    return { tasks };
  } catch (error) { return { tasks: [], error: error instanceof Error ? error.message : '输入参数无效。' }; }
}
