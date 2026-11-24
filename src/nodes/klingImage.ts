export const klingImageModel = 'kling-v4-image';
export const klingImageName = 'Kling V4 Image';
export const klingImageRatios = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'] as const;
export const klingImageResolutions = ['2K', '4K', '8K'] as const;
// APIMart Gold-tier credits per output image, from the 2026-11-24 price table.
export const klingImageOutputCredits = {
  '2K': 0.5714,
  '4K': 0.8571,
  '8K': 1.4286,
} as const satisfies Record<typeof klingImageResolutions[number], number>;
export const klingImageModes = ['standard', 'series'] as const;
export const klingImageMaxReferences = 10;
export const klingImageReferenceFormats = ['image/jpeg', 'image/png', 'image/gif'];
export const klingImageMaxReferenceBytes = 30 * 1024 * 1024;
export const defaultKlingImageSettings = { resolution: '2K', mode: 'standard', outputFormat: 'png' } as const;

export type KlingImageSettings = {
  size: typeof klingImageRatios[number];
  resolution: typeof klingImageResolutions[number];
  mode: typeof klingImageModes[number];
  outputFormat: 'png';
};
export type KlingImageRequest = KlingImageSettings & { prompt: string; images: string[]; count: number };

export const klingImageQuantityRange = (mode: unknown) => mode === 'series' ? { min: 2, max: 4 } : { min: 1, max: 9 };

export function validateKlingImageSettings(input: Record<string, unknown>): KlingImageSettings {
  const size = klingImageRatios.find(value => value === input.size);
  const resolution = klingImageResolutions.find(value => value === input.resolution);
  const mode = klingImageModes.find(value => value === input.mode);
  if (!size || !resolution || !mode || input.outputFormat !== 'png') throw new Error('Kling V4 Image 的比例、分辨率、生成模式或输出格式无效。');
  return { size, resolution, mode, outputFormat: 'png' };
}

export function validateKlingImagePrompt(value: unknown) {
  const prompt = typeof value === 'string' ? value.trim() : '';
  let ascii = 0, other = 0;
  for (const char of prompt) {
    if (char.charCodeAt(0) <= 127) ascii++;
    else other++;
  }
  if (!prompt || ascii / 50000 + other / 21000 > 1) {
    throw new Error('请输入 Kling V4 Image 提示词。纯英文最多 50,000 字符，中文等最多 21,000 字符，混合语言按比例计算。');
  }
  return prompt;
}

export function validateKlingImageRequest(input: Record<string, unknown>) {
  const settings = validateKlingImageSettings(input);
  const prompt = validateKlingImagePrompt(input.prompt);
  const count = input.count;
  const { min, max } = klingImageQuantityRange(settings.mode);
  if (typeof count !== 'number' || !Number.isInteger(count) || count < min || count > max) throw new Error(`Kling V4 Image 生成数量须为 ${min}–${max} 张。`);
  if (!Array.isArray(input.images) || input.images.length > klingImageMaxReferences || !input.images.every(image => typeof image === 'string')) {
    throw new Error(`Kling V4 Image 最多支持 ${klingImageMaxReferences} 张参考图。`);
  }
  return { ...settings, prompt, count, images: input.images as string[] };
}
