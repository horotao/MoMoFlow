export const sunburstModel = 'openai/gpt-image-2.5-sunburst';
export const sunburstName = 'GPT Image 2.5';
export const imageQualities = ['auto', 'low', 'medium', 'high'] as const;
export const imageBackgrounds = ['auto', 'transparent', 'opaque'] as const;
export const imageFormats = ['png', 'jpeg', 'webp'] as const;
export const imageSizes = ['auto', '1024x1024', '1536x1024', '1024x1536', '1536x1152', '1152x1536', '1280x1024', '1024x1280', '1536x864', '864x1536', '1792x768', '1536x768', '768x1536', '1536x512', '512x1536'] as const;
export const imageSizeLabels = ['自动', '正方形 · 1:1', '横向 · 3:2', '纵向 · 2:3', '横向 · 4:3', '纵向 · 3:4', '横向 · 5:4', '纵向 · 4:5', '横向 · 16:9', '纵向 · 9:16', '超宽 · 21:9', '横向 · 2:1', '纵向 · 1:2', '全景 · 3:1', '纵向 · 1:3'];
export type SunburstSettings = {
  quality: typeof imageQualities[number];
  background: typeof imageBackgrounds[number];
  size: string;
  outputFormat: typeof imageFormats[number];
};
export const sunburstFieldLabels: Record<keyof SunburstSettings, string> = { quality: 'Quality', background: 'Background', size: 'Aspect Ratio', outputFormat: 'Output Format' };
export const defaultSunburstSettings: SunburstSettings = { quality: 'medium', background: 'auto', size: 'auto', outputFormat: 'png' };
export type SunburstRequest = SunburstSettings & {
  prompt: string; images: string[]; mask?: string;
  // Client-only hint: convert opaque Invert masks; preserve existing alpha masks.
  maskMode?: 'luminance';
};

export function validateSunburstSettings(value: unknown): SunburstSettings {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  if (!imageQualities.some(v => v === input.quality) || !imageBackgrounds.some(v => v === input.background)
    || !imageFormats.some(v => v === input.outputFormat)) throw new Error('不支持的图片参数。');
  validateSunburstSize(input.size);
  if (input.background === 'transparent' && input.outputFormat === 'jpeg') throw new Error('透明背景需要 PNG 或 WebP 格式。');
  return { quality: input.quality, background: input.background, size: input.size, outputFormat: input.outputFormat } as SunburstSettings;
}

// OpenAI GPT Image 2.5 size constraints, shared by the editor and server.
export function validateSunburstSize(size: unknown): string {
  if (size === 'auto') return size;
  if (typeof size !== 'string' || !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(size)) throw new Error('请输入有效的宽高，例如 1536x864。');
  const [width, height] = size.split('x').map(Number);
  if (width % 16 || height % 16) throw new Error('宽高都必须是 16 的倍数。');
  if (Math.max(width, height) > 3840) throw new Error('任一边长不能超过 3840 像素。');
  if (Math.max(width, height) > Math.min(width, height) * 3) throw new Error('宽高比必须在 1:3 到 3:1 之间。');
  if (width * height < 655360 || width * height > 8294400) throw new Error('总像素必须在 655,360 到 8,294,400 之间。');
  return size;
}

export const sunburstChoices: Record<keyof SunburstSettings, readonly string[]> = {
  quality: imageQualities, background: imageBackgrounds, size: imageSizes, outputFormat: imageFormats,
};

export function sunburstParameterData(field: keyof SunburstSettings, value: string) {
  return { label: sunburstFieldLabels[field], model: value, options: sunburstChoices[field].includes(value) ? [...sunburstChoices[field]] : [value, ...sunburstChoices[field]], parameter: field };
}
