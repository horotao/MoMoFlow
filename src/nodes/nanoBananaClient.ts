import { assetResources } from './assetResources.ts';
import { readImage, dataUrl } from './imageGenerationClient.ts';
import { nanoBananaMaxImages, validateNanoBananaSettings, type NanoBananaRequest } from './nanoBanana.ts';
import type { FileAsset } from './types';

async function outputImage(blob: Blob, format: NanoBananaRequest['outputFormat'], signal: AbortSignal) {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  let canvas: HTMLCanvasElement | undefined;
  try {
    signal.throwIfAborted();
    const dimensions = { width: bitmap.width, height: bitmap.height };
    const mimeType = `image/${format}`;
    // Preserve original bytes when the provider already returned the chosen format.
    if (blob.type === mimeType) return { blob, ...dimensions };
    canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法转换图片格式。');
    if (format === 'jpeg') {
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    const encoded = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(value => value ? resolve(value) : reject(new Error('无法转换图片格式。')), mimeType, .95));
    signal.throwIfAborted();
    if (encoded.type !== mimeType) throw new Error('浏览器不支持所选图片格式。');
    return { blob: encoded, ...dimensions };
  } finally {
    bitmap.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export async function requestNanoBanana(input: NanoBananaRequest, signal: AbortSignal): Promise<FileAsset[]> {
  const settings = validateNanoBananaSettings(input);
  signal.throwIfAborted();
  if (input.images.length > nanoBananaMaxImages) throw new Error(`最多支持 ${nanoBananaMaxImages} 张参考图片。`);
  const images: string[] = []; let total = 0;
  for (const url of input.images) {
    const blob = await readImage(url, signal); total += blob.size;
    if (blob.size > 20 * 1024 * 1024) throw new Error('单张参考图片不能超过 20 MiB。');
    if (total > 46 * 1024 * 1024) throw new Error('参考图片总大小不能超过 46 MiB。');
    images.push(await dataUrl(blob));
  }
  signal.throwIfAborted();
  const response = await fetch('/api/nano-banana', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ ...settings, prompt: input.prompt, images }),
  });
  const result = await response.json().catch(() => { throw new Error('本地图片 API 不可用，请通过 npm run dev 启动服务。'); });
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : '图片生成失败。');
  if (!Array.isArray(result?.images) || !result.images.length) throw new Error('未返回有效图片。');
  const assets: FileAsset[] = [];
  try {
    for (const item of result.images) {
      const match = typeof item?.image === 'string' ? item.image.match(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/) : null;
      if (!match) throw new Error('未返回有效图片。');
      const source = await (await fetch(item.image, { signal })).blob();
      const { blob, width, height } = await outputImage(source, settings.outputFormat, signal);
      signal.throwIfAborted();
      assets.push({ id: crypto.randomUUID(), name: `Nano-Banana-2.1-${Date.now()}-${assets.length + 1}.${settings.outputFormat}`, kind: 'image', url: assetResources.create(blob), size: blob.size, width, height });
    }
    return assets;
  } catch (error) { assetResources.discard(assets.map(asset => asset.url)); throw error; }
}
