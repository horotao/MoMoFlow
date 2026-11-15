export const seedreamModel = 'seedream-5-5';
export const seedreamName = 'Seedream 5.5';
export const seedreamMaxImages = 10;
export const seedreamAspectRatios = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9', '2:1', '1:2'] as const;
export const seedreamResolutions = ['1.5K', '2K'] as const;
export const seedreamFormats = ['jpeg', 'png'] as const;
export type SeedreamSettings = {
  size: string;
  resolution: typeof seedreamResolutions[number];
  outputFormat: typeof seedreamFormats[number];
  background: 'auto' | 'transparent' | 'opaque';
  nsfwCheck: boolean;
  watermark: boolean;
};
export type SeedreamRequest = SeedreamSettings & { prompt: string; images: string[] };
export const defaultSeedreamSettings: SeedreamSettings = { size: 'auto', resolution: '1.5K', outputFormat: 'png', background: 'auto', nsfwCheck: false, watermark: false };
export const seedreamFieldLabels: Record<keyof SeedreamSettings, string> = { size: 'Aspect Ratio', resolution: 'Resolution', outputFormat: 'Output Format', background: 'Background', nsfwCheck: 'NSFW Check', watermark: 'Watermark' };
export const seedreamChoices = { size: ['auto', ...seedreamAspectRatios], resolution: seedreamResolutions, outputFormat: seedreamFormats, background: ['auto', 'transparent', 'opaque'], nsfwCheck: ['false', 'true'], watermark: ['false', 'true'] };
export const seedreamInputFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff', 'image/gif', 'image/heic', 'image/heif'];
export const seedreamSizeLimits = { minPixels: 921600, maxPixels: 4624220, maxAspectRatio: 16 } as const;

export const isSeedreamExactSize = (size: unknown): size is string => typeof size === 'string' && /^\d+x\d+$/.test(size);

export function validateSeedreamSize(value: unknown): string {
  // Workflows created before the ratio control retain tier-only sizing.
  if (value === undefined || value === 'auto') return 'auto';
  if (seedreamAspectRatios.some(ratio => ratio === value)) return String(value);
  if (!isSeedreamExactSize(value)) throw new Error('请选择支持的宽高比，或输入正整数宽度和高度。');
  const [width, height] = value.split('x').map(Number);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('精确像素的宽高必须为正整数。');
  const pixels = width * height;
  if (pixels < seedreamSizeLimits.minPixels || pixels > seedreamSizeLimits.maxPixels) throw new Error('精确像素的总像素须为 921,600–4,624,220。');
  if (width / height < 1 / seedreamSizeLimits.maxAspectRatio || width / height > seedreamSizeLimits.maxAspectRatio) throw new Error('精确像素的宽高比须为 1:16–16:1。');
  return `${width}x${height}`;
}

export function normalizeSeedreamSize(width: string | number, height: string | number, fallback = '1536x1536'): string {
  let previous = '1536x1536';
  try {
    const valid = validateSeedreamSize(fallback);
    if (isSeedreamExactSize(valid)) previous = valid;
  } catch { /* Old invalid drafts fall back to a valid 1.5K square. */ }
  const [previousWidth, previousHeight] = previous.split('x').map(Number);
  const integer = (value: string | number, previous: number) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.max(1, Math.round(number)) : previous;
  };
  const requestedWidth = integer(width, previousWidth), requestedHeight = integer(height, previousHeight);
  const requested = `${requestedWidth}x${requestedHeight}`;
  try { return validateSeedreamSize(requested); } catch { /* Fit the requested shape into the model's limits. */ }

  const { minPixels, maxPixels, maxAspectRatio } = seedreamSizeLimits;
  const ratio = Math.max(1 / maxAspectRatio, Math.min(maxAspectRatio, requestedWidth / requestedHeight));
  const pixels = Math.max(minPixels, Math.min(maxPixels, requestedWidth * requestedHeight));
  const targetWidth = Math.sqrt(pixels * ratio), targetHeight = Math.sqrt(pixels / ratio);
  let best = previous, distance = Infinity;
  // Fewer than 8,400 possible heights; choose the closest legal integer pair.
  // This also handles rounding at both the pixel-area and extreme-ratio limits.
  for (let h = Math.ceil(Math.sqrt(minPixels / maxAspectRatio)); h <= Math.floor(Math.sqrt(maxPixels * maxAspectRatio)); h++) {
    const minimumWidth = Math.max(Math.ceil(minPixels / h), Math.ceil(h / maxAspectRatio));
    const maximumWidth = Math.min(Math.floor(maxPixels / h), Math.floor(h * maxAspectRatio));
    if (minimumWidth > maximumWidth) continue;
    const w = Math.max(minimumWidth, Math.min(maximumWidth, Math.round(targetWidth)));
    const candidateDistance = (w - targetWidth) ** 2 + (h - targetHeight) ** 2;
    if (candidateDistance < distance) { best = `${w}x${h}`; distance = candidateDistance; }
  }
  return best;
}

export function seedreamPreviewAspectRatio(value: unknown): string | null {
  try {
    const size = validateSeedreamSize(value);
    return size === 'auto' ? null : size.replace(isSeedreamExactSize(size) ? 'x' : ':', ' / ');
  } catch { return null; }
}

export function validateSeedreamSettings(value: unknown): SeedreamSettings {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  const size = validateSeedreamSize(input.size);
  const resolution = isSeedreamExactSize(size) && !seedreamResolutions.some(option => option === input.resolution) ? defaultSeedreamSettings.resolution : input.resolution;
  if (!seedreamResolutions.some(option => option === resolution) || !seedreamFormats.some(option => option === input.outputFormat)) throw new Error('Seedream 仅支持 1.5K / 2K 和 JPEG / PNG。');
  if (!['auto', 'transparent', 'opaque'].includes(String(input.background))) throw new Error('不支持的 Seedream 背景模式。');
  if (input.background === 'transparent' && input.outputFormat !== 'png') throw new Error('Seedream 透明背景必须使用 PNG 输出。');
  const boolean = (field: 'nsfwCheck' | 'watermark') => {
    if (input[field] === true || input[field] === 'true') return true;
    if (input[field] === false || input[field] === 'false') return false;
    throw new Error(`无效的 ${seedreamFieldLabels[field]} 参数。`);
  };
  return { size, resolution, outputFormat: input.outputFormat, background: input.background, nsfwCheck: boolean('nsfwCheck'), watermark: boolean('watermark') } as SeedreamSettings;
}

export function seedreamParameterData(field: keyof SeedreamSettings, value: string) {
  const choices: readonly string[] = seedreamChoices[field];
  return { label: seedreamFieldLabels[field], model: value, options: choices.includes(value) ? [...choices] : [value, ...choices], parameter: field };
}
