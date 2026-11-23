import { apimartInputUrl } from '../src/nodes/apimartResult.ts';
import {
  nanoBananaInputFormats, nanoBananaMaxImageBytes, nanoBananaMaxImages, nanoBananaMaxInputBytes,
  validateNanoBananaModel, validateNanoBananaSettings,
} from '../src/nodes/nanoBanana.ts';

export function buildNanoBananaRequest(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  const model = validateNanoBananaModel(input.model);
  const settings = validateNanoBananaSettings(input, model);
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32000) {
    throw new Error('请连接非空提示词，最多 32000 个字符。');
  }
  if (!Array.isArray(input.images) || input.images.length > nanoBananaMaxImages) {
    throw new Error(`最多支持 ${nanoBananaMaxImages} 张参考图片。`);
  }
  let total = 0;
  const images = input.images.map((source: unknown, index: number) => {
    if (typeof source === 'string' && !source.startsWith('data:')) return apimartInputUrl(source);
    // Local default-key requests upload the file server-side.
    const match = typeof source === 'string' ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source) : null;
    if (!match || !nanoBananaInputFormats.includes(match[1]) || match[2].length % 4 !== 0) {
      throw new Error('Nano Banana 参考图需为 PNG、JPEG 或 WebP。');
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > nanoBananaMaxImageBytes) throw new Error('单张参考图片必须非空且不能超过 20 MiB。');
    total += bytes.length;
    if (total > nanoBananaMaxInputBytes) throw new Error('参考图片总大小不能超过 46 MiB。');
    return { blob: new Blob([new Uint8Array(bytes)], { type: match[1] }), filename: `reference-${index + 1}.${match[1].slice(6)}` };
  });
  return {
    images,
    body: { model, prompt: input.prompt.trim(), size: settings.aspectRatio, resolution: settings.imageSize, n: 1 },
  };
}
