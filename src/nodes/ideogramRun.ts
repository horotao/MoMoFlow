import type { Edge } from '@xyflow/react';
import type { AppNode, IdeogramNode } from './types';
import { isIdeogramNode, isNodeLocked, isInvertNode, isMasksExtractorNode, isMatteGrowShrinkNode } from './types.ts';
import { defaultIdeogramEditSettings, ideogramChoices, ideogramEditModel, ideogramImageInputCount, ideogramModel, validateIdeogramEditSettings, validateIdeogramPrompt, validateIdeogramSettings, type IdeogramRequest } from './ideogram.ts';
import { resolveTextValue } from './textVariables.ts';
import type { PreviewTask } from './taskQueue';
import { imageOutput } from './sunburstRun.ts';
import { resolveOutputSource } from './router.ts';

export function effectiveIdeogramSettings(node: IdeogramNode, nodes: AppNode[], edges: Edge[]) {
  return Object.fromEntries(Object.keys(ideogramChoices).map(field => {
    const edge = edges.find(item => item.target === node.id && item.targetHandle === field);
    const value = edge ? resolveTextValue(edge.source, nodes, edges).trim() : ({ ...defaultIdeogramEditSettings, ...node.data })[field as keyof typeof ideogramChoices];
    return [field, field === 'enablePromptExpansion' && value === 'true' ? true : field === 'enablePromptExpansion' && value === 'false' ? false : value];
  }));
}

export function prepareIdeogramRun(nodes: AppNode[], edges: Edge[], ids: string[], runs: number): { tasks: PreviewTask[]; error?: string } {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) return { tasks: [], error: '运行次数必须为 1–10。' };
  const tasks: PreviewTask[] = [], batchId = crypto.randomUUID(), createdAt = Date.now();
  try {
    for (const id of new Set(ids)) {
      const node = nodes.find(item => item.id === id);
      if (!node || !isIdeogramNode(node) || isNodeLocked(node)) continue;
      const effective = effectiveIdeogramSettings(node, nodes, edges);
      const promptEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'prompt');
      const prompt = validateIdeogramPrompt(promptEdge ? resolveTextValue(promptEdge.source, nodes, edges) : '');
      const inputEdges = edges.filter(edge => edge.target === id);
      const sourceEdge = inputEdges.find(edge => edge.targetHandle === 'image-0');
      const references = inputEdges.filter(edge => /^image-[1-9]\d*$/.test(edge.targetHandle ?? ''))
        .sort((a, b) => Number(a.targetHandle?.slice(6)) - Number(b.targetHandle?.slice(6)));
      const maskEdge = inputEdges.find(edge => edge.targetHandle === 'mask');
      let request: IdeogramRequest;
      if (!sourceEdge) {
        if (maskEdge || references.length) throw new Error('使用参考图或 Mask 时，必须将原图连接到 Image 输入。');
        request = { ...validateIdeogramSettings(effective), prompt };
      } else {
        const sources = imageOutput(nodes.find(item => item.id === sourceEdge.source), sourceEdge.sourceHandle, nodes, edges);
        if (sources.length !== 1) throw new Error('Image 必须连接一张待编辑的原图；空结果或多图集合无法编辑。');
        const referenceImages = references.flatMap(edge => {
          if (Number(edge.targetHandle?.slice(6)) >= ideogramImageInputCount(node.data.imageInputs)) throw new Error('参考图端口不存在。');
          const assets = imageOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges);
          if (!assets.length) throw new Error('连接的参考图尚无图片，上游未提供可用输出。');
          return assets.map(asset => asset.url);
        });
        if (referenceImages.length > (maskEdge ? 3 : 4)) throw new Error(maskEdge ? '使用 Mask 时最多支持 3 张参考图。' : '最多支持 4 张参考图。');
        let mask: string | undefined, maskMode: 'luminance' | undefined;
        if (maskEdge) {
          const origin = resolveOutputSource(nodes.find(item => item.id === maskEdge.source), maskEdge.sourceHandle, nodes, edges);
          const source = origin?.node;
          const assets = imageOutput(source, source?.type === 'painter' && origin?.handle === 'mask' ? 'alpha-mask' : origin?.handle, nodes, edges);
          if (assets.length !== 1) throw new Error('Mask 必须连接一张蒙版图片。');
          mask = assets[0].url;
          if (assets[0].maskMode === 'luminance' || isInvertNode(source) || isMatteGrowShrinkNode(source) || (isMasksExtractorNode(source) && origin?.handle === 'mask')) maskMode = 'luminance';
        }
        // Retain the saved custom size, but force source dimensions in modes that require it.
        const settings = validateIdeogramEditSettings({ ...effective, ...(mask || effective.editPrecision === 'high' ? { editSize: 'auto' } : {}) }, Boolean(mask));
        request = { ...settings, prompt, image: sources[0].url, referenceImages, ...(mask ? { mask, ...(maskMode ? { maskMode } : {}) } : {}) };
      }
      for (let index = 0; index < runs; index++) tasks.push({
        id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model: request.image ? ideogramEditModel : ideogramModel,
        ideogramRequest: structuredClone(request), progress: 0, state: 'Queued', started: 0,
      });
    }
    return { tasks };
  } catch (error) { return { tasks: [], error: error instanceof Error ? error.message : '输入参数无效。' }; }
}
