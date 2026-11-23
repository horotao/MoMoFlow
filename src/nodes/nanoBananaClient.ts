import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { requestApimartImage } from './apimartClient.ts';
import { uploadApimartImages } from './apimartUpload.ts';
import { downloadApimartResult } from './apimartResult.ts';
import { assetResources } from './assetResources.ts';
import { readImage } from './imageGenerationClient.ts';
import { nanoBananaInputFormats, nanoBananaMaxImageBytes, nanoBananaMaxImages, nanoBananaMaxInputBytes, nanoBananaProModel, validateNanoBananaModel, validateNanoBananaSettings, type NanoBananaRequest } from './nanoBanana.ts';
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
  const credentialHeaders = apiCredentialHeaders('apimart');
  const model = validateNanoBananaModel(input.model);
  const settings = validateNanoBananaSettings(input, model);
  signal.throwIfAborted();
  if (!input.prompt.trim() || input.prompt.length > 32000) throw new Error('请连接非空提示词，最多 32000 个字符。');
  if (input.images.length > nanoBananaMaxImages) throw new Error(`最多支持 ${nanoBananaMaxImages} 张参考图片。`);
  const blobs: Blob[] = [];
  let total = 0;
  for (const url of input.images) {
    const blob = await readImage(url, signal, false, nanoBananaInputFormats);
    total += blob.size;
    if (!blob.size || blob.size > nanoBananaMaxImageBytes) throw new Error('单张参考图片必须非空且不能超过 20 MiB。');
    if (total > nanoBananaMaxInputBytes) throw new Error('参考图片总大小不能超过 46 MiB。');
    blobs.push(blob);
  }
  const images = await uploadApimartImages(blobs, credentialHeaders, signal);
  const filename = model === nanoBananaProModel ? 'Nano-Banana-Pro' : 'Nano-Banana-2.1';
  return requestApimartImage('/api/nano-banana', { ...settings, ...(input.model ? { model } : {}), prompt: input.prompt, images }, credentialHeaders, signal, async result => {
    const source = await downloadApimartResult(result, undefined, signal);
    const { blob, width, height } = await outputImage(source, settings.outputFormat, signal);
    signal.throwIfAborted();
    return [{
      id: crypto.randomUUID(), name: `${filename}-${Date.now()}.${settings.outputFormat}`,
      kind: 'image', url: assetResources.create(blob), size: blob.size, width, height,
    }];
  });
}
