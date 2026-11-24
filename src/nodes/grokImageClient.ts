import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { requestApimartImage } from './apimartClient.ts';
import { downloadApimartResult } from './apimartResult.ts';
import { uploadApimartImages } from './apimartUpload.ts';
import { assetResources } from './assetResources.ts';
import { readImage } from './imageGenerationClient.ts';
import { validateGrokImageRequest, type GrokImageRequest } from './grokImage.ts';
import type { FileAsset } from './types';

export async function requestGrokImage(input: GrokImageRequest, signal: AbortSignal): Promise<FileAsset[]> {
  const request = validateGrokImageRequest(input);
  const headers = apiCredentialHeaders('apimart');
  const blobs = [];
  for (const source of request.images) blobs.push(await readImage(source, signal, false));
  const images = await uploadApimartImages(blobs, headers, signal);
  return requestApimartImage('/api/apimart/grok', { ...request, images, outputFormat: 'png' }, headers, signal, async result => {
    const blob = await downloadApimartResult(result, undefined, signal);
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    bitmap.close();
    signal.throwIfAborted();
    const createdAt = Date.now();
    return [{ id: crypto.randomUUID(), name: `Grok-Imagine-2.0-${createdAt}.${blob.type.slice(6)}`, kind: 'image',
      url: assetResources.create(blob), size: blob.size, mimeType: blob.type, width, height, createdAt }];
  });
}
