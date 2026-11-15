import { apiCredentialHeaders } from '../components/apiSettings.ts';
import { ModelRequestCancelled, modelTimeoutCode, modelRequestError } from './modelRequestError.ts';
import { readImage, dataUrl } from './imageGenerationClient.ts';
import { assetResources } from './assetResources.ts';
import type { FileAsset } from './types';
import { validateSunburstSettings, validateSunburstImageInputs, validateSunburstProvider, type SunburstRequest } from './sunburst.ts';
import { validateVectorSvg } from './vectorSvg.ts';


function waitForApimartPoll(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 4000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestSunburst(input: SunburstRequest, signal: AbortSignal): Promise<FileAsset> {
  const provider = validateSunburstProvider(input.provider);
  const apimart = provider === 'apimart';
  const credentialHeaders = apiCredentialHeaders(provider);
  validateSunburstImageInputs(input.outputFormat, input.images.length > 0, Boolean(input.mask), provider, input.channelModel);
  if (apimart) validateSunburstSettings(input);
  const { maskMode, ...request } = input;
  const blobs: Blob[] = []; let total = 0;
  for (const url of input.images) {
    const blob = await readImage(url, signal, false, apimart && (input.channelModel === 'gpt-image-2.6' || (input.resolution ?? '1K') === '1K') ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] : undefined); total += blob.size;
    if (apimart && blob.size > 20 * 1024 * 1024) throw new Error('APIMart 单张参考图片不能超过 20 MiB。');
    if (total > 46 * 1024 * 1024) throw new Error('输入图片总大小不能超过 46 MiB。');
    blobs.push(blob);
  }
  let mask = input.mask ? await readImage(input.mask, signal, true) : undefined;
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
        const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const pixels = imageData.data;
        let transparent = false;
        for (let index = 3; index < pixels.length; index += 4) { if (pixels[index] < 255) { transparent = true; break; } }
        if (!transparent && maskMode === 'luminance') {
          // Match Painter's white = edit convention without changing the Invert asset.
          for (let index = 0; index < pixels.length; index += 4) {
            const alpha = 255 - Math.round(.299 * pixels[index] + .587 * pixels[index + 1] + .114 * pixels[index + 2]);
            pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
            pixels[index + 3] = alpha;
            if (alpha < 255) transparent = true;
          }
          if (transparent) {
            context.putImageData(imageData, 0, 0);
            mask = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法导出 Mask。')), 'image/png'));
            signal.throwIfAborted();
            if (mask.size > 32 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
            if (total + mask.size > 46 * 1024 * 1024) throw new Error('输入图片总大小不能超过 46 MiB。');
          }
        }
        if (!transparent) throw new Error('Mask 需要透明区域，透明部分表示要编辑的区域。');
      } finally { bitmap.close(); }
    } finally { first.close(); }
  }
  signal.throwIfAborted();
  let response = await fetch(apimart ? '/api/apimart/images' : '/api/sunburst', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...credentialHeaders }, signal,
    body: JSON.stringify({ ...request, images: await Promise.all(blobs.map(dataUrl)), ...(mask ? { mask: await dataUrl(mask) } : {}) }),
  });
  let result = await response.json().catch(() => { throw new Error('本地图片 API 不可用，请通过 npm run dev 启动服务。'); });
  if (apimart && response.ok) {
    const taskId: unknown = result.taskId;
    if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(taskId)) throw new Error('APIMart 未返回有效任务编号，请检查请求记录。');
    // Keep polling the submitted task even when a status request times out.
    // Only the initial request can create a billable generation.
    for (;;) {
      await waitForApimartPoll(signal);
      response = await fetch('/api/apimart/task', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...credentialHeaders }, signal,
        body: JSON.stringify({ taskId, outputFormat: input.outputFormat }),
      });
      result = await response.json().catch(() => { throw new Error(`无法读取 APIMart 任务 ${taskId}，请检查请求记录。`); });
      if (!response.ok && result.code === modelTimeoutCode) continue;
      if (!response.ok) { result.error = `${result.error || 'APIMart 查询失败。'}\n任务编号：${taskId}`; break; }
      if (result.status === 'cancelled') throw new ModelRequestCancelled(`APIMart 任务已取消。\n任务编号：${taskId}`);
      if (typeof result.image === 'string') break;
      if (!['submitted', 'pending', 'processing'].includes(result.status)) throw new Error(`APIMart 任务状态无效，任务编号：${taskId}`);
    }
  }
  if (!response.ok) throw modelRequestError(result.error || '图片生成失败。', response.status, result.code);
  if (typeof result.image !== 'string' || !/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(result.image)) throw new Error('未返回有效图片。');
  const blob = await (await fetch(result.image, { signal })).blob();
  const svg = blob.type === 'image/svg+xml';
  if ((input.outputFormat === 'svg') !== svg || (result.format === 'svg') !== svg) throw new Error('返回格式与请求不符，未取得 SVG 矢量结果。');
  let dimensions: { width: number; height: number };
  if (svg) dimensions = validateVectorSvg(new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer()));
  else {
    const bitmap = await createImageBitmap(blob);
    dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close();
  }
  signal.throwIfAborted();
  return { id: crypto.randomUUID(), name: `${input.variant ?? 'Sunburst'}-${Date.now()}.${result.format}`, kind: 'image', url: assetResources.create(blob), size: blob.size, ...dimensions };
}
