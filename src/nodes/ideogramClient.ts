import { assetResources } from './assetResources.ts';
import { readImage } from './imageGenerationClient.ts';
import { validateIdeogramEditSettings, validateIdeogramPrompt, validateIdeogramSettings, type IdeogramRequest } from './ideogram.ts';
import { prepareIdeogramEditImages } from './ideogramEditClient.ts';
import type { FileAsset } from './types';

export async function requestIdeogram(input: IdeogramRequest, signal: AbortSignal): Promise<FileAsset[]> {
  signal.throwIfAborted();
  const prompt = validateIdeogramPrompt(input.prompt);
  const body = input.image !== undefined
    ? { ...validateIdeogramEditSettings(input, Boolean(input.mask)), prompt, ...await prepareIdeogramEditImages(input, signal) }
    : { ...validateIdeogramSettings(input), prompt };
  signal.throwIfAborted();
  const response = await fetch(input.image !== undefined ? '/api/ideogram/edit' : '/api/ideogram', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => { throw new Error('本地图片 API 不可用，请通过 npm run dev 启动服务。'); });
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : '图片生成失败。');
  const taskId = typeof result?.taskId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(result.taskId) ? result.taskId : '';
  const assets: FileAsset[] = [];
  try {
    if (!Array.isArray(result?.outputs) || !result.outputs.length || result.outputs.length > 4) throw new Error('未返回有效图片。');
    for (const item of result.outputs) {
      const url = typeof item === 'string' ? new URL(item) : undefined;
      if (!url || url.protocol !== 'https:' || url.username || url.password) throw new Error('未返回有效图片地址。');
      // Import the provider's temporary URL into managed local assets immediately.
      const blob = await readImage(url.href, signal);
      const bitmap = await createImageBitmap(blob);
      try {
        signal.throwIfAborted();
        assets.push({ id: crypto.randomUUID(), name: `Ideogram-4.5-${Date.now()}-${assets.length + 1}.${blob.type.slice(6)}`, kind: 'image', url: assetResources.create(blob), size: blob.size, width: bitmap.width, height: bitmap.height });
      } finally { bitmap.close(); }
    }
    return assets;
  } catch (error) {
    assetResources.discard(assets.map(asset => asset.url));
    if (signal.aborted) throw error;
    throw new Error(`读取 Ideogram 图片失败；请到 WaveSpeed History 查看结果后再决定是否重新生成。${taskId ? ` Task ID：${taskId}` : ''}`);
  }
}
