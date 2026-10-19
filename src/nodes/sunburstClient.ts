import type { FileAsset } from './types';
import type { SunburstRequest } from './sunburst';

async function readImage(url: string, signal: AbortSignal, mask = false): Promise<Blob> {
  if (!/^(blob:|data:image\/|https?:\/\/)/.test(url)) throw new Error('无效的输入图片地址。');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('无法读取输入图片。');
  const blob = await response.blob();
  if (!(mask ? ['image/png'] : ['image/png', 'image/jpeg', 'image/webp']).includes(blob.type)) throw new Error(mask ? 'Mask 必须为带透明通道的 PNG。' : '参考图片需为 PNG、JPEG 或 WebP。');
  if (blob.size > 32 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
  return blob;
}
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('无法读取图片。'));
  reader.readAsDataURL(blob);
});

export async function requestSunburst(input: SunburstRequest, signal: AbortSignal): Promise<FileAsset> {
  const blobs: Blob[] = []; let total = 0;
  for (const url of input.images) {
    const blob = await readImage(url, signal); total += blob.size;
    if (total > 46 * 1024 * 1024) throw new Error('输入图片总大小不能超过 46 MiB。');
    blobs.push(blob);
  }
  const mask = input.mask ? await readImage(input.mask, signal, true) : undefined;
  if (total + (mask?.size ?? 0) > 46 * 1024 * 1024) throw new Error('输入图片总大小不能超过 46 MiB。');
  if (mask) {
    if (!blobs.length) throw new Error('使用 Mask 时必须连接 Image。');
    const first = await createImageBitmap(blobs[0]);
    try {
      const bitmap = await createImageBitmap(mask);
      try {
        if (bitmap.width !== first.width || bitmap.height !== first.height) throw new Error('Mask 尺寸必须与第一张 Image 一致。');
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('无法验证 Mask。');
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let transparent = false;
        for (let index = 3; index < pixels.length; index += 4) { if (pixels[index] < 255) { transparent = true; break; } }
        if (!transparent) throw new Error('Mask 需要透明区域，透明部分表示要编辑的区域。');
      } finally { bitmap.close(); }
    } finally { first.close(); }
  }
  signal.throwIfAborted();
  const response = await fetch('/api/sunburst', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ ...input, images: await Promise.all(blobs.map(dataUrl)), ...(mask ? { mask: await dataUrl(mask) } : {}) }),
  });
  const result = await response.json().catch(() => { throw new Error('本地图片 API 不可用，请通过 npm run dev 启动服务。'); });
  if (!response.ok) throw new Error(result.error || '图片生成失败。');
  if (typeof result.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(result.image)) throw new Error('未返回有效图片。');
  const blob = await (await fetch(result.image, { signal })).blob();
  const bitmap = await createImageBitmap(blob);
  const dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close();
  signal.throwIfAborted();
  // Object URLs live with canvas history, just like imported File assets.
  return { id: crypto.randomUUID(), name: `Sunburst-${Date.now()}.${result.format}`, kind: 'image', url: URL.createObjectURL(blob), size: blob.size, ...dimensions };
}
