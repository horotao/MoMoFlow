export const nanoBananaModel = 'google/gemini-nano-banana-2.1';
export const nanoBananaName = 'Nano Banana 2.1';
// Application limits; the final capability/availability is determined by ZenMux.
export const nanoBananaMaxImages = 14;
export const nanoBananaAspectRatios = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'] as const;
export const nanoBananaImageSizes = ['1K', '2K', '4K'] as const;
export const nanoBananaFormats = ['png', 'jpeg'] as const;
export type NanoBananaSettings = {
  aspectRatio: typeof nanoBananaAspectRatios[number];
  imageSize: typeof nanoBananaImageSizes[number];
  outputFormat: typeof nanoBananaFormats[number];
};
export type NanoBananaRequest = NanoBananaSettings & { prompt: string; images: string[] };
export const defaultNanoBananaSettings: NanoBananaSettings = { aspectRatio: 'auto', imageSize: '1K', outputFormat: 'png' };
export const nanoBananaFieldLabels: Record<keyof NanoBananaSettings, string> = { aspectRatio: 'Aspect Ratio', imageSize: 'Resolution', outputFormat: 'Output Format' };
export const nanoBananaChoices = { aspectRatio: nanoBananaAspectRatios, imageSize: nanoBananaImageSizes, outputFormat: nanoBananaFormats };

export function validateNanoBananaSettings(value: unknown): NanoBananaSettings {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  if (!nanoBananaAspectRatios.some(option => option === input.aspectRatio)
    || !nanoBananaImageSizes.some(option => option === input.imageSize)
    || !nanoBananaFormats.some(option => option === input.outputFormat)) throw new Error('不支持的 Nano Banana 图片参数。');
  return { aspectRatio: input.aspectRatio, imageSize: input.imageSize, outputFormat: input.outputFormat } as NanoBananaSettings;
}

export function nanoBananaParameterData(field: keyof NanoBananaSettings, value: string) {
  const choices: readonly string[] = nanoBananaChoices[field];
  return { label: nanoBananaFieldLabels[field], model: value, options: choices.includes(value) ? [...choices] : [value, ...choices], parameter: field };
}
