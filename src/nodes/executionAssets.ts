import { aborted, withAbort } from './workflowExecution.ts';

export const executionAssetTimeoutMs = 30000;

// One deadline covers headers, response body and optional content hashing.
// Racing the signal also bounds custom fetch implementations that ignore abort.
export async function readExecutionAsset(url: string, signal: AbortSignal, snapshot = false, timeoutMs = executionAssetTimeoutMs) {
  aborted(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort('读取图片超时，请检查图片来源后重试。'), timeoutMs);
  try {
    return await withAbort((async () => {
      const response = await fetch(url, { signal: controller.signal, ...(snapshot ? { cache: 'no-cache' as const } : {}) });
      aborted(controller.signal);
      if (!response.ok) throw new Error('图片无法读取，可能已失效或被移除。');
      const blob = await response.blob();
      aborted(controller.signal);
      if (!blob.size) throw new Error('图片内容为空。');
      const contentHash = snapshot ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('') : undefined;
      aborted(controller.signal);
      return { blob, contentHash };
    })(), controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
