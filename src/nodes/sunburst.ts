export const sunburstModel = 'openai/gpt-image-2.5-sunburst';
export const sunburstProviders = ['zenmux', 'openai'] as const;
export type SunburstProvider = typeof sunburstProviders[number];
export const sunburstProviderLabels: Record<SunburstProvider, string> = { zenmux: 'ZenMux', openai: 'OpenAI 官方' };

// Missing provider means ZenMux for existing workflows and queued requests.
export function validateSunburstProvider(value: unknown): SunburstProvider {
  if (value === undefined) return 'zenmux';
  if (value === 'zenmux' || value === 'openai') return value;
  throw new Error('不支持的 GPT Image 2.5 渠道商。');
}

export function sunburstModelForProvider(provider: SunburstProvider): string {
  return provider === 'openai' ? 'gpt-image-2.5-sunburst' : sunburstModel;
}

export const sunburstName = 'GPT Image 2.5';
const zenmuxImageQualities = ['auto', 'low', 'medium', 'high'] as const;
export const imageQualities = [...zenmuxImageQualities, 'xhigh', 'max'] as const;
export const imageQualityLabels: Record<typeof imageQualities[number], string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
export function sunburstQualities(provider: SunburstProvider = 'zenmux'): readonly typeof imageQualities[number][] {
  return provider === 'openai' ? imageQualities : zenmuxImageQualities;
}
export const imageBackgrounds = ['auto', 'transparent', 'opaque'] as const;
export const imageFormats = ['png', 'jpeg', 'webp'] as const;
export const imageSizes = ['auto', '1024x1024', '1536x1024', '1024x1536', '1536x1152', '1152x1536', '1280x1024', '1024x1280', '1536x864', '864x1536', '1792x768', '1536x768', '768x1536', '1536x512', '512x1536'] as const;
export const imageSizeLabels = ['自动', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9', '2:1', '1:2', '3:1', '1:3'];
export const sunburstResolutions = ['1K', '2K', '4K'] as const;
export type SunburstResolution = typeof sunburstResolutions[number];

// Keep size as the single saved/API value. Resolution presets preserve the exact
// aspect ratio and align both edges to 16 within OpenAI's edge and pixel limits.
export function sunburstPresetSize(ratio: string, resolution: SunburstResolution): string {
  if (ratio === 'auto') ratio = '1024x1024';
  if (!imageSizes.some(value => value === ratio)) throw new Error('请选择预设宽高比，或使用自定义尺寸。');
  if (resolution === '1K') return ratio;
  const [width, height] = ratio.split('x').map(Number);
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(width, height);
  const unitWidth = width / divisor * 16, unitHeight = height / divisor * 16;
  const edgeLimit = resolution === '2K' ? 2048 : 3840;
  const scale = Math.floor(Math.min(edgeLimit / Math.max(unitWidth, unitHeight), Math.sqrt(8294400 / (unitWidth * unitHeight))));
  return validateSunburstSize(`${unitWidth * scale}x${unitHeight * scale}`);
}

export const sunburstSizePresets = sunburstResolutions.flatMap(resolution => imageSizes.filter(size => size !== 'auto').map(ratio => ({
  ratio, resolution, size: sunburstPresetSize(ratio, resolution),
})));
export const sunburstSizeChoices = ['auto', ...sunburstSizePresets.map(preset => preset.size)];
export function sunburstSizePreset(size: string) {
  return sunburstSizePresets.find(preset => preset.size === size);
}
export type SunburstSettings = {
  quality: typeof imageQualities[number];
  background: typeof imageBackgrounds[number];
  size: string;
  outputFormat: typeof imageFormats[number];
};
export const sunburstFieldLabels: Record<keyof SunburstSettings, string> = { quality: 'Quality', background: 'Background', size: 'Aspect Ratio', outputFormat: 'Output Format' };
export const defaultSunburstSettings: SunburstSettings = { quality: 'medium', background: 'auto', size: 'auto', outputFormat: 'png' };
export type SunburstRequest = SunburstSettings & {
  provider?: SunburstProvider;
  prompt: string; images: string[]; mask?: string;
  // Client-only hint: convert opaque Invert masks; preserve existing alpha masks.
  maskMode?: 'luminance';
};

export function validateSunburstSettings(value: unknown): SunburstSettings {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  const provider = validateSunburstProvider(input.provider);
  if (!imageQualities.some(v => v === input.quality) || !imageBackgrounds.some(v => v === input.background)
    || !imageFormats.some(v => v === input.outputFormat)) throw new Error('不支持的图片参数。');
  if (!sunburstQualities(provider).some(v => v === input.quality)) throw new Error(`${sunburstProviderLabels[provider]} 暂未接入此画质参数，请选择自动、低、中或高，或切换到 OpenAI 官方渠道。`);
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
  quality: zenmuxImageQualities, background: imageBackgrounds, size: sunburstSizeChoices, outputFormat: imageFormats,
};

export function sunburstParameterData(field: keyof SunburstSettings, value: string, provider: SunburstProvider = 'zenmux') {
  const choices: readonly string[] = field === 'quality' ? sunburstQualities(provider) : sunburstChoices[field];
  return { label: sunburstFieldLabels[field], model: value, options: choices.includes(value) ? [...choices] : [value, ...choices], parameter: field };
}
