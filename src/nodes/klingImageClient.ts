import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { requestApimartImage } from './apimartClient.ts';
import { downloadApimartResult } from './apimartResult.ts';
import { uploadApimartImages } from './apimartUpload.ts';
import { assetResources } from './assetResources.ts';
import { readImage } from './imageGenerationClient.ts';
import { klingImageMaxReferenceBytes, klingImageReferenceFormats, validateKlingImageRequest, type KlingImageRequest } from './klingImage.ts';
import type { FileAsset } from './types';

export async function requestKlingImage(input: KlingImageRequest, signal: AbortSignal): Promise<FileAsset[]> {
  const request = validateKlingImageRequest(input);
  const headers = apiCredentialHeaders('apimart');
  const references: Blob[] = [];
  let total = 0;
  for (const url of request.images) {
    signal.throwIfAborted();
    const blob = await readImage(url, signal, false, klingImageReferenceFormats);
    if (!blob.size || blob.size > klingImageMaxReferenceBytes) throw new Error('Kling V4 Image 参考图须非空且不超过 30 MiB。');
    total += blob.size;
    if (!headers['X-MoMoFlow-Api-Key'] && total > 46 * 1024 * 1024) throw new Error('本地参考图总大小不能超过 46 MiB。');
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    bitmap.close();
    if (width < 300 || height < 300 || width / height < 2 / 5 || width / height > 5 / 2) {
      throw new Error('Kling V4 Image 参考图的宽和高须至少 300 像素，宽高比须在 2:5 至 5:2 之间。');
    }
    references.push(blob);
  }
  const images = await uploadApimartImages(references, headers, signal);
  return requestApimartImage('/api/apimart/kling', { ...request, images }, headers, signal, async result => {
    const urls = result.imageUrls;
    if (!Array.isArray(urls) || !urls.length || urls.length > request.count) throw new Error('APIMart 返回了无效的 Kling 图片列表。');
    const assets: FileAsset[] = [];
    try {
      for (const [index, imageUrl] of urls.entries()) {
        const blob = await downloadApimartResult({ imageUrl, format: result.format }, 'png', signal, {
          maxMiB: request.resolution === '8K' ? 320 : 128, timeoutMs: 180000,
        });
        const bitmap = await createImageBitmap(blob);
        const { width, height } = bitmap;
        bitmap.close();
        signal.throwIfAborted();
        const createdAt = Date.now();
        assets.push({ id: crypto.randomUUID(), name: `Kling-V4-Image-${index + 1}-${createdAt}.png`, kind: 'image',
          url: assetResources.create(blob), size: blob.size, mimeType: blob.type, width, height, createdAt });
      }
      return assets;
    } catch (error) {
      assetResources.discard(assets.map(asset => asset.url));
      throw error;
    }
  }, { allImages: true, interval: 5000 });
}
