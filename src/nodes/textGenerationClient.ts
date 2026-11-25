import { notifyApimartGenerationCompleted } from './apimartGeneration.ts';
import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { readImage, dataUrl } from './imageGenerationClient.ts';
import { uploadApimartImages } from './apimartUpload.ts';
import { uploadOpenAIImages } from './openaiImageUpload.ts';
import { readTextBilling, readTextUsage } from './textPricing.ts';
import { textCitations } from './textCitations.ts';
import { readSse } from './responseStream.ts';
import { isTextModel, isTextReasoningEffort, textModelProvider, type TextRequest, type TextResult } from './textGeneration.ts';
import type { TextGenerationResult } from './types.ts';

export type TextBatchItem = {
  id: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  text: string;
  startedAt?: number;
  result?: TextGenerationResult;
  error?: string;
};
export type TextExecutor = (signal: AbortSignal, onText: (text: string) => void) => Promise<TextResult>;

export async function runTextBatch(ids: readonly string[], prompt: string, execute: TextExecutor, signal: AbortSignal, callbacks: {
  onChange: (items: TextBatchItem[]) => void;
  onCompleted: (result: TextGenerationResult) => void;
}) {
  const items: TextBatchItem[] = ids.map(id => ({ id, state: 'queued', text: '' }));
  const publish = () => { if (!signal.aborted) callbacks.onChange(items.map(item => ({ ...item }))); };
  let next = 0;
  async function worker() {
    while (!signal.aborted && next < items.length) {
      const index = next++;
      const item = items[index];
      item.state = 'running'; item.startedAt = Date.now(); publish();
      try {
        const output = await execute(signal, text => {
          if (signal.aborted) return;
          item.text = text; publish();
        });
        if (signal.aborted) return;
        const result = { ...output, id: item.id, prompt, createdAt: Date.now() };
        item.state = 'completed'; item.text = output.text; item.result = result;
        callbacks.onCompleted(result);
      } catch (error) {
        if (signal.aborted) return;
        item.state = 'failed'; item.text = '';
        item.error = error instanceof Error ? error.message : '文本生成失败，请手动重试。';
      }
      publish();
    }
  }
  publish();
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
  return items;
}

export async function readTextResponse(response: Response, signal: AbortSignal, onText: (text: string) => void): Promise<TextResult> {
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(typeof result.error === 'string' ? result.error : `文本生成失败（${response.status}）。`);
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('文本服务未返回流式响应，请重启开发服务器。');
  let text = '';
  for await (const event of readSse(response.body, signal)) {
    if (event.type === 'error') throw new Error(typeof event.message === 'string' ? event.message : '文本生成失败。');
    if (event.type === 'delta' && typeof event.delta === 'string') {
      text += event.delta;
      if (text.length > 2 * 1024 * 1024) throw new Error('文本结果过长，已停止读取。');
      onText(text);
    }
    if (event.type === 'completed') {
      if (typeof event.text !== 'string' || !event.text.trim() || !isTextModel(event.model) || typeof event.responseId !== 'string') throw new Error('文本结果不完整。');
      onText(event.text);
      const usage = readTextUsage(event.usage), snapshot = readTextBilling(event.billing);
      const billing = snapshot?.model === event.model ? snapshot : undefined;
      return { text: event.text, model: event.model, responseId: event.responseId,
        ...(isTextReasoningEffort(event.reasoningEffort) ? { reasoningEffort: event.reasoningEffort } : {}),
        ...(typeof event.webSearch === 'boolean' ? { webSearch: event.webSearch } : {}),
        ...(Array.isArray(event.citations) ? { citations: textCitations(event.citations, event.text) } : {}),
        ...(usage ? { usage } : {}), ...(billing ? { billing } : {}) };
    }
  }
  throw new Error('生成连接中断，未收到完成确认。原有结果已保留，请检查用量后手动重试。');
}

/** Capture image bytes and credentials once so every variant uses the same input. */
export async function prepareTextRequest(input: TextRequest, signal: AbortSignal): Promise<TextExecutor> {
  const provider = textModelProvider(input.model);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...apiCredentialHeaders(provider) };
  let total = 0;
  const blobs: Blob[] = [];
  for (const url of input.images) {
    const blob = await readImage(url, signal);
    total += blob.size;
    if (total > 46 * 1024 * 1024) throw new Error('输入图片总大小不能超过 46 MiB。');
    if (!blob.size) throw new Error('参考图片为空。');
    blobs.push(blob);
  }
  let images: string[] = [];
  if (blobs.length) {
    const key = headers['X-MoMoFlow-Api-Key'];
    if (key) {
      images = provider === 'apimart'
        ? await uploadApimartImages(blobs, headers, signal)
        : await uploadOpenAIImages(blobs, headers['X-MoMoFlow-Base-Url'], key, signal);
    } else if (typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      images = await Promise.all(blobs.map(dataUrl));
    } else {
      throw new Error(`请先在「更多 → API 设置」填写 ${provider === 'apimart' ? 'APIMart' : 'OpenAI'} API Key，再上传参考图片。`);
    }
  }
  signal.throwIfAborted();
  const body = JSON.stringify({ ...input, images });
  return async (signal, onText) => {
    signal.throwIfAborted();
    const response = await fetch('/api/text', { method: 'POST', headers, body, signal });
    const result = await readTextResponse(response, signal, onText);
    if (provider === 'apimart') notifyApimartGenerationCompleted();
    return result;
  };
}

export async function requestText(input: TextRequest, signal: AbortSignal, onText: (text: string) => void): Promise<TextResult> {
  const execute = await prepareTextRequest(input, signal);
  return execute(signal, onText);
}
