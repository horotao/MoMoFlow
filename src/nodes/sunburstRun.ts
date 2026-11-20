import { resolveOutputSource } from './outputPort.ts';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, SunburstNode } from './types';
import { isNodeLocked, isSunburstNode, isImageGeneratorNode } from './types.ts';
import { fileAssets } from './fileCollection.ts';
import { selectedImageResult, isPinnedResultHandle, pinnedResultAsset, pinnedResultInput, sameAnnotationImage } from './annotationGraph.ts';
import type { AnnotationMark } from './interactiveEdit.ts';
import { resolveTextValue } from './textVariables.ts';
import { apimartExtMarkupError, apimartFixedSettings, migrateSunburstProvider, sunburstParameterDefaults, validateSunburstImageInputs, validateSunburstMarkup, validateSunburstVariant, sunburstModelForProvider, validateSunburstProvider, validateSunburstSettings } from './sunburst.ts';
import type { SunburstRequest } from './sunburst';
import type { PreviewTask } from './taskQueue';

export function imageOutput(node: AppNode | undefined, handle?: string | null): FileAsset[] {
  if (node?.type === 'file') return fileAssets(node.data).filter(asset => asset.kind === 'image');
  if (!isImageGeneratorNode(node)) return [];
  const result = isPinnedResultHandle(handle) ? pinnedResultAsset(node, handle) : selectedImageResult(node);
  return result ? [result] : [];
}

export function effectiveSunburstSettings({ data }: SunburstNode) {
  return { ...sunburstParameterDefaults, ...data, ...migrateSunburstProvider(data.provider), ...apimartFixedSettings };
}

export function resolveSunburstEditPrompt(id: string, nodes: AppNode[], edges: Edge[], isApimartExt: boolean) {
  let original: FileAsset | undefined;
  const marks: AnnotationMark[] = [];
  const text = resolveTextValue(id, nodes, edges, undefined, ({ image, mark }) => {
    if (isApimartExt) throw new Error(apimartExtMarkupError);
    if (original && !sameAnnotationImage(original, image)) throw new Error('GPT Image 交互编辑每次只能标注一张原图，请将不同原图的指令放到各自的 GPT Image 节点。');
    original ??= image;
    let index = marks.indexOf(mark);
    if (index < 0) index = marks.push(mark) - 1;
    return mark.end ? `红框 ${index + 1} 内` : `红圈 ${index + 1} 中心`;
  }).trim();
  const prompt = original
    ? `${text}\n红圈指向其中心的编辑目标，红框指示要编辑的范围。成图不要保留红色标注和编号。`
    : text;
  return { prompt, original,
    markupMarks: marks.length ? marks.map(({ start, end }) => ({ start, end })) : undefined };
}

export function prepareSunburstRun(nodes: AppNode[], edges: Edge[], ids: string[], runs: number): { tasks: PreviewTask[]; error?: string } {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) return { tasks: [], error: 'Runs 必须为 1–10。' };
  const tasks: PreviewTask[] = []; const batchId = crypto.randomUUID(); const createdAt = Date.now();
  try {
    for (const id of new Set(ids)) {
      const node = nodes.find(item => item.id === id);
      if (!node || !isSunburstNode(node) || isNodeLocked(node)) continue;
      const effective = effectiveSunburstSettings(node);
      const provider = validateSunburstProvider(effective.provider);
      const variant = validateSunburstVariant(effective.variant);
      const settings = validateSunburstSettings(effective);
      const inputs = edges.filter(edge => edge.target === id);
      const promptEdge = inputs.find(edge => edge.targetHandle === 'prompt');
      const edit = promptEdge ? resolveSunburstEditPrompt(promptEdge.source, nodes, edges, settings.channelModel === 'gpt-image-2.6-ext') : undefined;
      const prompt = edit?.prompt ?? '';
      if (!prompt || prompt.length > 32000) throw new Error('请为每个选中节点连接非空 Prompt，最多 32000 个字符。');
      const imageEdges = inputs.filter(edge => edge.targetHandle?.startsWith('image-')).sort((a, b) => Number(a.targetHandle?.slice(6)) - Number(b.targetHandle?.slice(6)));
      const maskEdge = inputs.find(edge => edge.targetHandle === 'mask');
      const original = edit?.original;
      if (edit?.markupMarks) validateSunburstMarkup(settings.outputFormat, true, Boolean(maskEdge));
      validateSunburstImageInputs(settings.outputFormat, Boolean(original || imageEdges.length), Boolean(maskEdge), provider, settings.channelModel);
      const references = imageEdges.flatMap(edge => {
        const input = pinnedResultInput(edge, promptEdge?.source, nodes, edges) ?? edge;
        const assets = imageOutput(nodes.find(item => item.id === input.source), input.sourceHandle);
        if (!assets.length) throw new Error('连接的 Image 尚无图片，上游未提供可用输出。');
        return assets;
      });
      const images = (original ? [original, ...references.filter(asset => !sameAnnotationImage(asset, original))] : references).map(asset => asset.url);
      if (images.length > 16) throw new Error('最多支持 16 张参考图片。');
      let mask: string | undefined;
      let maskMode: SunburstRequest['maskMode'];
      if (maskEdge) {
        const origin = resolveOutputSource(nodes.find(item => item.id === maskEdge.source), maskEdge.sourceHandle);
        const source = origin?.node;
        const assets = imageOutput(source, origin?.handle);
        if (assets.length !== 1) throw new Error('Mask 必须连接一张 PNG 图片。');
        if (!images.length) throw new Error('使用 Mask 时必须连接 Image。');
        mask = assets[0].url;
        if (assets[0].maskMode === 'luminance') maskMode = 'luminance';
      }
      const markup = edit?.markupMarks ? { markupMarks: edit.markupMarks } : {};
      for (let index = 0; index < runs; index++) tasks.push({ id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model: sunburstModelForProvider(provider, variant, settings.channelModel), imageRequest: { ...settings, provider, variant, prompt, images, mask, ...markup, ...(maskMode ? { maskMode } : {}) }, progress: 0, state: 'Queued', started: 0 });
    }
    return { tasks };
  } catch (error) { return { tasks: [], error: error instanceof Error ? error.message : '输入参数无效。' }; }
}
