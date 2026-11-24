import { parseReferenceImages } from './apimartReferences.ts';
import {
  nanoBananaMaxImages,
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
  const images = parseReferenceImages(input.images);
  return {
    images,
    body: { model, prompt: input.prompt.trim(), size: settings.aspectRatio, resolution: settings.imageSize, n: 1 },
  };
}
