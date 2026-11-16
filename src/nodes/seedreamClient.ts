import { uploadApimartImages } from './apimartUpload.ts';
import { requestApimartImage } from './apimartClient.ts';
import { downloadApimartResult } from './apimartResult.ts';
import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { assetResources } from './assetResources.ts';
import { readImage } from './imageGenerationClient.ts';
import { seedreamInputFormats, seedreamMaxImages, validateSeedreamSettings, type SeedreamRequest } from './seedream.ts';
import type { FileAsset } from './types';

export async function requestSeedream(input: SeedreamRequest, signal: AbortSignal): Promise<FileAsset> {
  const settings = validateSeedreamSettings(input);
  const credentialHeaders = apiCredentialHeaders('apimart');
  signal.throwIfAborted();
  if (input.images.length > seedreamMaxImages) throw new Error(`最多支持 ${seedreamMaxImages} 张参考图片。`);
  if (!input.prompt.trim() || input.prompt.length > 32000) throw new Error('请连接非空 Prompt，最多 32000 个字符。');
  const blobs: Blob[] = []; let total = 0;
  for (const url of input.images) {
    const blob = await readImage(url, signal, false, seedreamInputFormats); total += blob.size;
    if (blob.size > 30 * 1024 * 1024) throw new Error('Seedream 单张参考图片不能超过 30 MiB。');
    if (total > 46 * 1024 * 1024) throw new Error('参考图片总大小不能超过 46 MiB。');
    const bitmap = await createImageBitmap(blob);
    try {
      const { width, height } = bitmap;
      if (width < 1 || height < 1 || width * height > 36000000) throw new Error('Seedream 参考图尺寸无效或总像素超过 3600 万。');
    } finally { bitmap.close(); }
    blobs.push(blob);
  }
  const images = await uploadApimartImages(blobs, credentialHeaders, signal);
  return requestApimartImage('/api/apimart/seedream', { ...settings, prompt: input.prompt, images }, credentialHeaders, signal, async result => {
    const blob = await downloadApimartResult(result, settings.outputFormat, signal);
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    signal.throwIfAborted();
    return { id: crypto.randomUUID(), name: `Seedream-${Date.now()}.${settings.outputFormat}`, kind: 'image', url: assetResources.create(blob), size: blob.size, ...dimensions };
  });
}
