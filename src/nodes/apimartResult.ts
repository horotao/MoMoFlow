export function apimartResultUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('APIMart 未返回有效结果 URL。');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('APIMart 未返回有效结果 URL。'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.')
    || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('APIMart 结果必须为公开 HTTPS 图片地址。');
  }
  return url.href;
}

// Download directly from the CDN, without the user's provider credentials.
// Keep the original bytes as a Blob so existing asset persistence still works.
export async function downloadApimartResult(result: { imageUrl?: unknown; format?: unknown }, format: string, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  if (result.format !== format) throw new Error('APIMart 返回的图片格式与请求不符。');
  const url = apimartResultUrl(result.imageUrl);
  const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  let response: Response;
  try {
    response = await fetch(url, { signal: downloadSignal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors' });
  } catch {
    signal.throwIfAborted();
    throw new Error('无法下载 APIMart 结果，可能是网络、链接过期或 CDN 跨域限制；不会重新生成。');
  }
  const reader = response.body?.getReader();
  try {
    if (!response.ok) throw new Error(`APIMart 图片下载失败（HTTP ${response.status}）；不会重新生成。`);
    const mime = `image/${format === 'svg' ? 'svg+xml' : format}`;
    if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== mime) throw new Error('APIMart 返回的图片格式与请求不符。');
    if (!reader) throw new Error('APIMart 返回空图片。');
    const limit = 32 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit) throw new Error('APIMart 返回图片超过 32 MiB。');
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    for (;;) {
      downloadSignal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('APIMart 返回图片超过 32 MiB。');
      chunks.push(new Uint8Array(value));
    }
    downloadSignal.throwIfAborted();
    if (!size) throw new Error('APIMart 返回空图片。');
    return new Blob(chunks, { type: mime });
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
}

export function apimartInputUrl(value: unknown): string {
  try {
    if (typeof value !== 'string' || value.length > 8192) throw new Error();
    return apimartResultUrl(value);
  } catch { throw new Error('APIMart 参考图片必须为公开 HTTPS URL。'); }
}
