import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { deepSeekFileIdPattern, describerImageFormats, describerMaxImages, describerMaxInstructions, describerRequestTimeoutMs, describerUploadTimeoutMs } from './describer.ts';
import { dataUrl } from './imageGenerationClient.ts';
import { ModelRequestTimeout, modelRequestError } from './modelRequestError.ts';
import type { PreviewTask } from './taskQueue';

const MiB = 1024 * 1024;

async function readImages(urls: string[], directUpload: boolean, signal: AbortSignal) {
  const images: Blob[] = [];
  const maxImageBytes = (directUpload ? 64 : 32) * MiB;
  const maxTotalBytes = (directUpload ? 200 : 46) * MiB;
  let total = 0;
  for (const url of urls) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('无法读取输入图片。');
    const blob = await response.blob();
    if (!blob.size || !describerImageFormats.includes(blob.type)) throw new Error('请使用非空的 JPEG、PNG、GIF 或 WebP 图片。');
    if (blob.size > maxImageBytes) throw new Error(`单张图片不能超过 ${maxImageBytes / MiB} MiB。`);
    total += directUpload ? blob.size : Math.ceil(blob.size / 3) * 4;
    if (total > maxTotalBytes) throw new Error('图片总大小过大，请减少图片数量或缩小图片。');
    images.push(blob);
  }
  return images;
}

async function uploadImage(endpoint: string, apiKey: string, image: Blob, index: number, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('expires_after[anchor]', 'created_at');
  form.append('expires_after[seconds]', '3600');
  form.append('file', image, `image-${index + 1}.${image.type.slice(6)}`);
  const response = await fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors',
  }).catch((error: unknown) => {
    if (!signal.aborted && error instanceof TypeError) throw new Error('无法直传图片到 DeepSeek，请检查网络及 Files API 的跨域配置。');
    throw error;
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: '请检查 DeepSeek API Key。', 403: '请检查 DeepSeek API Key 或权限。',
      413: '图片超过上传服务的大小限制。', 429: '请检查 DeepSeek 上传额度，稍后重试。',
    };
    throw modelRequestError(`第 ${index + 1} 张图片上传失败（HTTP ${response.status}）。${messages[response.status] ?? ''}`, response.status);
  }
  const result = await response.json().catch(() => undefined);
  signal.throwIfAborted();
  if (typeof result?.id !== 'string' || !deepSeekFileIdPattern.test(result.id)) throw new Error('DeepSeek Files API 未返回有效的文件 ID。');
  return result.id;
}

export async function requestDescription(task: PreviewTask, signal: AbortSignal): Promise<string> {
  const credentialHeaders = apiCredentialHeaders('deepseek');
  const apiKey = credentialHeaders['X-MoMoFlow-Api-Key'];
  if (task.model !== 'deepseek-flash') throw new Error('请选择 deepseek-flash；其他模型尚未接入。');
  if (!task.images?.length || task.images.length > describerMaxImages) throw new Error(`请连接 1–${describerMaxImages} 张图片。`);
  const instructions = task.instructions ?? '';
  if (instructions.length > describerMaxInstructions) throw new Error('系统指令过长。');
  signal.throwIfAborted();

  // Only local Vite can use a server-only .env key and its existing inline path.
  if (!apiKey && typeof location !== 'undefined' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    throw new Error('请先在「更多 → API 设置」填写 DeepSeek API Key，再上传图片。');
  }
  const localOrUploadDeadline = AbortSignal.timeout(apiKey ? describerUploadTimeoutMs : describerRequestTimeoutMs);
  const imageSignal = AbortSignal.any([signal, localOrUploadDeadline]);
  let body: object;
  try {
    const images = await readImages(task.images, Boolean(apiKey), imageSignal);
    if (apiKey) {
      const endpoint = `${credentialHeaders['X-MoMoFlow-Base-Url'].replace(/\/+$/, '')}/files`;
      const fileIds: string[] = [];
      for (const [index, image] of images.entries()) fileIds.push(await uploadImage(endpoint, apiKey, image, index, imageSignal));
      body = { instructions, fileIds };
    } else {
      body = { model: task.model, instructions, images: await Promise.all(images.map(dataUrl)) };
    }
    imageSignal.throwIfAborted();
  } catch (error) {
    signal.throwIfAborted();
    if (localOrUploadDeadline.aborted) throw new ModelRequestTimeout('读取或上传图片超时，尚未提交图片描述请求。');
    throw error;
  }

  const describeDeadline = apiKey ? AbortSignal.timeout(describerRequestTimeoutMs) : localOrUploadDeadline;
  const describeSignal = AbortSignal.any([signal, describeDeadline]);
  try {
    const response = await fetch('/api/describer', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...credentialHeaders },
      body: JSON.stringify(body), signal: describeSignal,
    });
    const result = await response.json().catch(() => undefined);
    describeSignal.throwIfAborted();
    if (!response.ok) throw modelRequestError(result?.error || `图片理解请求失败（HTTP ${response.status}）。`, response.status, result?.code);
    if (typeof result?.text !== 'string' || !result.text.trim()) throw new Error('未返回提示词。');
    return result.text;
  } catch (error) {
    signal.throwIfAborted();
    if (describeDeadline.aborted) throw new ModelRequestTimeout('图片描述请求超时；不会自动重试。');
    throw error;
  }
}
