import { validApiKey, validBaseUrl } from '../components/apiSettings.ts';
import { apimartInputUrl } from './apimartResult.ts';
import { dataUrl } from './imageGenerationClient.ts';

export async function readImageApiResponse(response: Response) {
  if (response.status === 413) throw new Error('图片请求过大（HTTP 413），请减小参考图片或使用图片直传。');
  return response.json().catch(() => { throw new Error(`图片接口返回了无效响应（HTTP ${response.status}），请检查服务状态。`); });
}

// Use the same credential snapshot as the later generation request. Never send
// image bytes through the hosted function or expose a server-only default key.
export async function uploadApimartImages(blobs: Blob[], credentialHeaders: Record<string, string>, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted();
  if (!blobs.length) return [];
  const key = credentialHeaders['X-MoMoFlow-Api-Key'];
  // Local .env-only development retains its existing server-side upload path.
  if (!key) {
    if (typeof location !== 'undefined' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      throw new Error('请先在「更多 → API 设置」填写 APIMart API Key，再上传参考图片。');
    }
    return Promise.all(blobs.map(dataUrl));
  }
  const base = credentialHeaders['X-MoMoFlow-Base-Url'];
  if (!validApiKey(key) || !validBaseUrl(base ?? '')) throw new Error('请在 API 设置中保存有效的 APIMart 配置。');
  const endpoint = `${apimartInputUrl(base).replace(/\/+$/, '')}/uploads/images?retention_days=3`;
  // Validate every file before the first upload consumes provider quota.
  for (const blob of blobs) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)) throw new Error('APIMart 上传仅支持 PNG、JPEG、WebP 或 GIF。');
    if (!blob.size || blob.size > 30 * 1024 * 1024) throw new Error('APIMart 上传图片须非空且不超过 30 MiB（含 Mask）。');
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > 32768 || bitmap.height > 32768 || bitmap.width * bitmap.height > 40000000) {
        throw new Error('APIMart 上传图片不能超过 4000 万像素，单边不能超过 32768 像素。');
      }
    } finally { bitmap.close(); }
    signal.throwIfAborted();
  }
  const urls: string[] = [];
  for (const [index, blob] of blobs.entries()) {
    signal.throwIfAborted();
    const form = new FormData(); form.append('file', blob, `reference-${index + 1}.${blob.type.slice(6)}`);
    const uploadSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
        signal: uploadSignal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors',
      });
      const result = await readImageApiResponse(response);
      if (!response.ok) {
        const detail = typeof result?.error?.message === 'string' ? result.error.message : typeof result?.error === 'string' ? result.error : '';
        throw new Error(`APIMart 图片上传失败（HTTP ${response.status}）。${detail.replaceAll(key, '[已隐藏]').slice(0, 1000)}`);
      }
      urls.push(apimartInputUrl(result?.url));
      signal.throwIfAborted();
    } catch (error) {
      signal.throwIfAborted();
      if (uploadSignal.aborted) throw new Error('APIMart 图片上传超时，尚未提交生成任务。');
      if (error instanceof TypeError) throw new Error('无法直传图片到 APIMart，请检查网络及上传接口的跨域配置（需允许 Authorization）；尚未提交生成任务。');
      throw error;
    }
  }
  return urls;
}
