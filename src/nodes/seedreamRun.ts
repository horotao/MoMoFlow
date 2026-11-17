import type { Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { isSeedreamNode, isNodeLocked } from './types.ts';
import { seedreamMaxImages, seedreamModel, validateSeedreamSettings } from './seedream.ts';
import { imageOutput } from './sunburstRun.ts';
import { resolveTextValue } from './textVariables.ts';
import type { PreviewTask } from './taskQueue';

export function prepareSeedreamRun(nodes: AppNode[], edges: Edge[], ids: string[], runs: number): { tasks: PreviewTask[]; error?: string } {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) return { tasks: [], error: '运行次数必须为 1–10。' };
  const tasks: PreviewTask[] = [], batchId = crypto.randomUUID(), createdAt = Date.now();
  try {
    for (const id of new Set(ids)) {
      const node = nodes.find(item => item.id === id);
      if (!node || !isSeedreamNode(node) || isNodeLocked(node)) continue;
      const settings = validateSeedreamSettings({ ...node.data, size: node.data.size ?? 'auto' });
      const inputs = edges.filter(edge => edge.target === id);
      const promptEdge = inputs.find(edge => edge.targetHandle === 'prompt');
      const prompt = promptEdge ? resolveTextValue(promptEdge.source, nodes, edges).trim() : '';
      if (!prompt || prompt.length > 32000) throw new Error('请为 Seedream 连接非空提示词，最多 32000 个字符。');
      const images = inputs.filter(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))
        .sort((a, b) => Number(a.targetHandle?.slice(6)) - Number(b.targetHandle?.slice(6)))
        .flatMap(edge => {
          if (Number(edge.targetHandle?.slice(6)) >= node.data.imageInputs) throw new Error('参考图端口不存在。');
          const assets = imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges);
          if (!assets.length) throw new Error('连接的 Image 尚无图片，上游未提供可用输出。');
          return assets.map(asset => asset.url);
        });
      if (images.length > seedreamMaxImages) throw new Error(`最多支持 ${seedreamMaxImages} 张参考图片。`);
      for (let index = 0; index < runs; index++) tasks.push({
        id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model: seedreamModel,
        seedreamRequest: { ...settings, prompt, images: [...images] }, progress: 0, state: 'Queued', started: 0,
      });
    }
    return { tasks };
  } catch (error) { return { tasks: [], error: error instanceof Error ? error.message : '输入参数无效。' }; }
}
