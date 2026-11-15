import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { ModelRequestCancelled, ModelRequestTimeout, modelRequestError } from './modelRequestError.ts';
import { assetResources } from './assetResources.ts';
import { readImage, dataUrl } from './imageGenerationClient.ts';
import { seedreamInputFormats, seedreamMaxImages, validateSeedreamSettings, type SeedreamRequest } from './seedream.ts';
import type { FileAsset } from './types';

function waitForPoll(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 4000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestSeedream(input: SeedreamRequest, signal: AbortSignal): Promise<FileAsset> {
  const settings = validateSeedreamSettings(input);
  const credentialHeaders = apiCredentialHeaders('apimart');
  signal.throwIfAborted();
  if (input.images.length > seedreamMaxImages) throw new Error(`最多支持 ${seedreamMaxImages} 张参考图片。`);
  const images: string[] = []; let total = 0;
  for (const url of input.images) {
    const blob = await readImage(url, signal, false, seedreamInputFormats); total += blob.size;
    if (blob.size > 30 * 1024 * 1024) throw new Error('Seedream 单张参考图片不能超过 30 MiB。');
    if (total > 46 * 1024 * 1024) throw new Error('参考图片总大小不能超过 46 MiB。');
    const bitmap = await createImageBitmap(blob);
    try {
      const { width, height } = bitmap;
      if (width < 1 || height < 1 || width * height > 36000000) throw new Error('Seedream 参考图尺寸无效或总像素超过 3600 万。');
    } finally { bitmap.close(); }
    images.push(await dataUrl(blob));
  }
  const call = async (path: string, body: object) => {
    signal.throwIfAborted();
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...credentialHeaders }, signal, body: JSON.stringify(body) });
    const result = await response.json().catch(() => { throw new Error('无法读取 APIMart 响应，请检查本地服务。'); });
    if (!response.ok) throw modelRequestError(result.error || 'Seedream 请求失败。', response.status, result.code);
    return result;
  };
  // Only this first call can create a billable task. Never resubmit on errors.
  const submitted = await call('/api/apimart/seedream', { ...settings, prompt: input.prompt, images });
  const taskId: unknown = submitted.taskId;
  if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(taskId)) throw new Error('APIMart 未返回有效任务编号，请检查请求记录后再手动重试。');
  try {
    for (;;) {
      await waitForPoll(signal);
      let result;
      try { result = await call('/api/apimart/task', { taskId, outputFormat: settings.outputFormat }); }
      catch (error) { if (error instanceof ModelRequestTimeout && !signal.aborted) continue; throw error; }
      if (result.status === 'cancelled') throw new ModelRequestCancelled('APIMart 任务已取消。');
      if (typeof result.image !== 'string') {
        if (['submitted', 'pending', 'processing'].includes(result.status)) continue;
        throw new Error('APIMart 返回了无效任务状态。');
      }
      if (result.format !== settings.outputFormat || !result.image.startsWith(`data:image/${settings.outputFormat};base64,`)) throw new Error('Seedream 返回图片格式与请求不符。');
      const blob = await (await fetch(result.image, { signal })).blob();
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close();
      signal.throwIfAborted();
      return { id: crypto.randomUUID(), name: `Seedream-${Date.now()}.${settings.outputFormat}`, kind: 'image', url: assetResources.create(blob), size: blob.size, ...dimensions };
    }
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof ModelRequestCancelled) throw new ModelRequestCancelled(`${error.message}\n任务编号：${taskId}`);
    throw new Error(`${error instanceof Error ? error.message : 'Seedream 查询失败。'}\n任务编号：${taskId}`);
  }
}
