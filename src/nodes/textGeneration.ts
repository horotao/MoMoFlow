import type { TextBilling, TextUsage } from './textPricing.ts';
import { estimateTextCost } from './textPricing.ts';
import type { Edge } from '@xyflow/react';
import { imageInputHandles, isImageInputHandle } from './connectionRules.ts';
import { textWithCitations } from './textCitations.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { isCanvasImageNode, isCanvasTextNode, type AppNode, type CanvasText, type TextComposerData, type TextGenerationResult, type TextReasoningEffort, type TextCitation } from './types.ts';

export const textModels = [
  { id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol', brand: 'openai', time: '约 20 秒', description: '适合日常写作、代码与综合推理。' },
  { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', brand: 'openai', time: '约 20 秒', description: '适合图片理解、视觉推理和自然文字表达。' },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', brand: 'openai', time: '约 10 秒', description: '适合快速、轻量的文本任务。' },
] as const;
export type TextModelId = typeof textModels[number]['id'];
export const defaultTextModel: TextModelId = 'gpt-6.2-sol';
export const isTextModel = (value: unknown): value is TextModelId => textModels.some(model => model.id === value);
const legacyModels: Record<string, TextModelId> = { 'gpt-4.1': defaultTextModel, 'gpt-4o': 'gpt-6.1-terra', 'o4-mini': 'gpt-6-luna' };
export function textModelSelection(selection: TextComposerData['selection']): TextComposerData['selection'] {
  return { ...selection, modelIds: selection.modelIds.map(id => legacyModels[id] ?? id) };
}
export const textReasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const isTextReasoningEffort = (value: unknown): value is TextReasoningEffort => textReasoningEfforts.some(effort => effort === value);
export type TextRequest = { model: TextModelId; prompt: string; images: string[]; reasoningEffort?: TextReasoningEffort; webSearch?: boolean };
export type TextResult = { text: string; model: TextModelId; responseId: string; reasoningEffort?: TextReasoningEffort; webSearch?: boolean; citations?: TextCitation[]; usage?: TextUsage; billing?: TextBilling };

export function textQuantity(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new Error('Text 生成数量应为 1 至 20 的整数。');
  return value;
}

export function textHistory(data: CanvasText['data']): TextGenerationResult[] {
  if (data.textHistory?.length) return data.textHistory;
  if (!data.text) return [];
  return [{ id: data.textGeneration?.responseId || 'legacy-text-result', text: data.text,
    prompt: data.textComposer.prompt, model: data.textGeneration?.model || textModelSelection(data.textComposer.selection).modelIds[0] || defaultTextModel,
    responseId: data.textGeneration?.responseId || '', createdAt: data.textGeneration?.createdAt || 0 }];
}

export function selectTextResult(data: CanvasText['data'], result: TextGenerationResult) {
  return {
    text: result.text, activeTextResultId: result.id,
    textGeneration: { model: result.model, responseId: result.responseId, createdAt: result.createdAt },
    textComposer: { ...data.textComposer, prompt: result.prompt, reasoningEffort: result.reasoningEffort ?? 'low', webSearch: result.webSearch ?? false,
      selection: textModelSelection({ modelIds: [result.model], autoSelect: false, multiple: false }) },
  };
}

export function completeTextResult(data: CanvasText['data'], result: TextGenerationResult) {
  return { ...selectTextResult(data, result), textHistory: [...textHistory(data), result] };
}

/** Insert asynchronous completions in submission order without losing siblings. */
export function completeTextBatchResult(data: CanvasText['data'], result: TextGenerationResult, order: readonly string[], select: boolean) {
  const history = textHistory(data);
  const batchIds = new Set(order);
  const results = new Map(history.filter(item => batchIds.has(item.id)).map(item => [item.id, item]));
  results.set(result.id, result);
  return {
    ...(select ? selectTextResult(data, result) : {}),
    textHistory: [...history.filter(item => !batchIds.has(item.id)), ...order.flatMap(id => {
      const item = results.get(id);
      return item ? [item] : [];
    })],
  };
}

/** Unrun Text nodes pass their authored text; completed nodes pass the selected result. */
export function textOutputValue(data: CanvasText['data']) {
  if (!data.text.trim()) return data.textComposer.prompt;
  const history = textHistory(data);
  const result = history.find(item => item.id === data.activeTextResultId) ?? history[history.length - 1];
  return textWithCitations(data.text, result?.citations);
}

export function textGenerationInput(id: string, nodes: AppNode[], edges: Edge[]): TextRequest & { quantity: number } {
  const node = nodes.find(node => node.id === id);
  if (!node || !isCanvasTextNode(node)) throw new Error('找不到 Text 节点。');
  if (node.data.locked) throw new Error('节点已锁定。');
  const composer = node.data.textComposer;
  const selection = textModelSelection(composer.selection);
  if (selection.autoSelect || selection.multiple || selection.modelIds.length !== 1) throw new Error('请直接选择一个文本模型；自动选择和多模型暂未接入。');
  const model = selection.modelIds[0];
  if (!isTextModel(model)) throw new Error('请选择 GPT-6.2 Sol、GPT-6.1 Terra 或 GPT-6 Luna。');
  const quantity = textQuantity(composer.quantity);
  const textInputs = edges.filter(edge => edge.target === id && edge.targetHandle === 'text').map(edge => {
    const source = nodes.find(item => item.id === edge.source);
    if (!source || !isCanvasTextNode(source)) throw new Error('找不到上游 Text，请检查连线。');
    const text = textOutputValue(source.data);
    if (!text.trim()) throw new Error('上游 Text 为空，请填写文字或选择生成结果。');
    return text;
  });
  const prompt = [...textInputs, composer.prompt].filter(value => value.trim()).join('\n\n');
  if (!prompt.trim() || prompt.length > 128000) throw new Error('请输入提示词或连接非空 Text，总文本最多 128000 个字符。');
  const images = edges.filter(edge => edge.target === id && isImageInputHandle(edge.targetHandle))
    .sort((a, b) => imageInputHandles.indexOf(a.targetHandle!) - imageInputHandles.indexOf(b.targetHandle!)).map(edge => {
      const source = nodes.find(item => item.id === edge.source);
      const asset = source && isCanvasImageNode(source) ? selectedImageResult(source) : undefined;
      if (!asset) throw new Error('参考图片尚未就绪，请先生成或导入图片。');
      return asset.url;
    });
  const reasoningEffort = composer.reasoningEffort ?? 'low';
  if (!isTextReasoningEffort(reasoningEffort)) throw new Error('请选择受支持的思考强度。');
  const webSearch = composer.webSearch ?? false;
  if (typeof webSearch !== 'boolean') throw new Error('网络搜索设置无效。');
  return { model, prompt, images, quantity, reasoningEffort, webSearch };
}

/** Preview uses current graph inputs without applying run validation or sending requests. */
export function estimateCanvasTextCost(id: string, nodes: AppNode[], edges: Edge[]) {
  const node = nodes.find(item => item.id === id);
  if (!node || !isCanvasTextNode(node)) return;
  const composer = node.data.textComposer;
  const selection = textModelSelection(composer.selection);
  const model = selection.modelIds[0];
  if (selection.autoSelect || selection.multiple || selection.modelIds.length !== 1 || !isTextModel(model)) return;
  const upstream = edges.filter(edge => edge.target === id && edge.targetHandle === 'text').flatMap(edge => {
    const source = nodes.find(item => item.id === edge.source);
    if (!source || !isCanvasTextNode(source)) return [];
    return [textOutputValue(source.data)];
  });
  return estimateTextCost(model, [...upstream, composer.prompt].join('\n\n'),
    edges.filter(edge => edge.target === id && isImageInputHandle(edge.targetHandle)).length,
    composer.quantity, composer.reasoningEffort ?? 'low', composer.webSearch ?? false);
}
