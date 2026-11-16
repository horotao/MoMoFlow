import { apimartInputUrl } from '../src/nodes/apimartResult.ts';
import { isSeedreamExactSize, seedreamInputFormats, seedreamMaxImages, seedreamModel, validateSeedreamSettings } from '../src/nodes/seedream.ts';

export function buildSeedreamRequest(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  const settings = validateSeedreamSettings(input);
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32000) throw new Error('请连接非空 Prompt，最多 32000 个字符。');
  if (!Array.isArray(input.images) || input.images.length > seedreamMaxImages) throw new Error(`最多支持 ${seedreamMaxImages} 张参考图片。`);
  if (['layer_decomposition', 'layerDecomposition', 'layer_decomposition_options', 'layerDecompositionOptions', 'mask', 'aspectRatio', 'n', 'stream', 'tools'].some(field => input[field] !== undefined)) throw new Error('当前 Seedream 节点不支持图层拆分、Mask 或额外的模型参数。');
  let total = 0;
  const imageUrls = input.images.map(url => {
    if (typeof url === 'string' && !url.startsWith('data:')) return apimartInputUrl(url);
    if (typeof url !== 'string' || !/^data:image\/[a-z]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(url) || !seedreamInputFormats.includes(url.slice(5, url.indexOf(';')))) throw new Error('无效的 Seedream 参考图片。');
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error('Seedream 单张参考图片不能超过 30 MiB。');
    total += bytes.length;
    if (total > 46 * 1024 * 1024) throw new Error('参考图片总大小不能超过 46 MiB。');
    return url;
  });
  // Auto preserves tier-only sizing; ratios add resolution, pixels omit it.
  const body: Record<string, unknown> = {
    model: seedreamModel, prompt: input.prompt, size: settings.size === 'auto' ? settings.resolution : settings.size,
    ...(settings.size !== 'auto' && !isSeedreamExactSize(settings.size) ? { resolution: settings.resolution } : {}),
    background: settings.background, nsfw_check: settings.nsfwCheck, output_format: settings.outputFormat, watermark: settings.watermark, n: 1,
    ...(imageUrls.length ? { image_urls: imageUrls } : {}),
  };
  // BYOK clients send uploaded URLs; local default-key clients retain Data URIs.
  return { images: [], body };
}
