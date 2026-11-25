import { isOpenAIFileId } from './textGeneration.ts';

/** Upload to the same account and Base URL that will receive the Responses request. */
export async function uploadOpenAIImages(blobs: Blob[], baseUrl: string, key: string, signal: AbortSignal) {
  const ids: string[] = [];
  for (const [index, blob] of blobs.entries()) {
    signal.throwIfAborted();
    const form = new FormData();
    form.append('file', blob, `reference-${index + 1}.${blob.type.slice(6)}`);
    form.append('purpose', 'vision');
    form.append('expires_after[anchor]', 'created_at');
    form.append('expires_after[seconds]', '3600');
    const uploadSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/files`, {
        method: 'POST', body: form, headers: { Authorization: `Bearer ${key}` }, signal: uploadSignal,
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors',
      });
      if (!response.ok) throw new Error(`OpenAI 图片上传失败（HTTP ${response.status}），请检查 Files 接口和密钥权限。`);
      const result = await response.json().catch(() => null);
      if (!isOpenAIFileId(result?.id)) throw new Error('OpenAI Files 接口未返回有效的文件 ID。');
      ids.push(result.id);
    } catch (error) {
      signal.throwIfAborted();
      if (uploadSignal.aborted) throw new Error('OpenAI 图片上传超时。');
      if (error instanceof TypeError) throw new Error('无法直传图片到 OpenAI，请检查网络及 Files 接口的跨域配置。');
      throw error;
    }
  }
  return ids;
}
