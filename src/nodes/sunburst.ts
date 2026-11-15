export const sunburstModel = 'openai/gpt-image-2.6-sunburst';
export const sunburstProviders = ['openai', 'zenmux', 'apimart'] as const;
export type SunburstProvider = typeof sunburstProviders[number];
export const sunburstProviderLabels: Record<SunburstProvider, string> = { zenmux: 'ZenMux', openai: 'OpenAI 官方', apimart: 'APIMart' };

// New nodes and older nodes without a saved provider use OpenAI.
export function validateSunburstProvider(value: unknown): SunburstProvider {
  if (value === undefined) return 'openai';
  if (value === 'zenmux' || value === 'openai' || value === 'apimart') return value;
  throw new Error('不支持的 GPT Image 2.6 渠道商。');
}

export const sunburstVariants = ['Sunburst', 'Flare'] as const;
export type SunburstVariant = typeof sunburstVariants[number];
export function validateSunburstVariant(value: unknown): SunburstVariant {
  if (value === undefined) return 'Sunburst';
  if (value === 'Sunburst' || value === 'Flare') return value;
  throw new Error('不支持的 GPT Image 2.6 模型版本。');
}

export function sunburstModelForProvider(provider: SunburstProvider, variant: SunburstVariant = 'Sunburst'): string {
  if (provider === 'apimart') return 'gpt-image-2.6-ext';
  const model = `gpt-image-2.6-${variant.toLowerCase()}`;
  return provider === 'openai' ? model : `openai/${model}`;
}

export const sunburstName = 'GPT Image 2.6';
const zenmuxImageQualities = ['auto', 'low', 'medium', 'high'] as const;
export const imageQualities = [...zenmuxImageQualities, 'xhigh', 'max'] as const;
export const imageQualityLabels: Record<typeof imageQualities[number], string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
export function sunburstQualities(provider: SunburstProvider = 'openai'): readonly typeof imageQualities[number][] {
  return provider === 'zenmux' ? zenmuxImageQualities : imageQualities;
}
export const imageBackgrounds = ['auto', 'transparent', 'opaque'] as const;
export const imageFormats = ['png', 'jpeg', 'webp', 'svg', 'gif'] as const;
export function sunburstFormats(provider: SunburstProvider): readonly typeof imageFormats[number][] {
  // The Ext documentation explicitly warns that SVG is currently unavailable.
  return provider === 'apimart' ? ['png', 'jpeg', 'webp', 'gif'] : ['png', 'jpeg', 'webp', 'svg'];
}
export const apimartAspectRatios = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9'] as const;
export const apimartComplexities = ['auto', 'low', 'medium', 'high'] as const;
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
  resolution?: SunburstResolution;
  complexity?: typeof apimartComplexities[number];
};
export type SunburstParameter = keyof SunburstSettings | 'provider' | 'variant';
export const sunburstFieldLabels: Record<SunburstParameter, string> = { provider: 'Provider', variant: 'Model Version', quality: 'Quality', background: 'Background', size: 'Aspect Ratio', outputFormat: 'Output Format', resolution: 'Resolution', complexity: 'Complexity' };
export function sunburstLocalParameter(data: SunburstSettings & { provider?: SunburstProvider; variant?: string }, field: SunburstParameter): string {
  return String(data[field] ?? (field === 'provider' ? 'openai' : field === 'variant' ? 'Sunburst' : field === 'resolution' ? '1K' : 'auto'));
}
export const defaultSunburstSettings: SunburstSettings = { quality: 'medium', background: 'auto', size: 'auto', outputFormat: 'png' };
export type SunburstRequest = SunburstSettings & {
  provider?: SunburstProvider;
  variant?: SunburstVariant;
  prompt: string; images: string[]; mask?: string;
  // Client-only hint: convert opaque Invert masks; preserve existing alpha masks.
  maskMode?: 'luminance';
};

export function validateSunburstSettings(value: unknown): SunburstSettings {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  const provider = validateSunburstProvider(input.provider);
  validateSunburstVariant(input.variant);
  if (!imageQualities.some(v => v === input.quality) || (provider !== 'apimart' && !imageBackgrounds.some(v => v === input.background))
    || !imageFormats.some(v => v === input.outputFormat)) throw new Error('不支持的图片参数。');
  if (!sunburstQualities(provider).some(v => v === input.quality)) throw new Error(`${sunburstProviderLabels[provider]} 暂未接入此画质参数，请选择自动、低、中或高，或切换到 OpenAI 官方渠道。`);
  if (!sunburstFormats(provider).some(v => v === input.outputFormat)) throw new Error(`${sunburstProviderLabels[provider]} 暂不支持此输出格式。`);
  if (provider === 'apimart') {
    if (!apimartAspectRatios.some(v => v === input.size)) throw new Error('APIMart 仅支持预设宽高比，不支持自定义宽高或像素尺寸。');
    const resolution = input.resolution ?? '1K';
    const complexity = input.complexity ?? 'auto';
    if (!sunburstResolutions.some(v => v === resolution)) throw new Error('APIMart 分辨率仅支持 1K、2K 或 4K。');
    if (!apimartComplexities.some(v => v === complexity)) throw new Error('不支持的 APIMart 复杂度。');
    if (input.outputFormat === 'gif' && input.size !== 'auto') throw new Error('GIF 输出的宽高比只能选择自动。');
    return { quality: input.quality, background: 'auto', size: input.size, outputFormat: input.outputFormat, resolution, complexity } as SunburstSettings;
  }
  validateSunburstSize(input.size);
  if (input.background === 'transparent' && input.outputFormat === 'jpeg') throw new Error('透明背景需要 PNG 或 WebP 格式。');
  return { quality: input.quality, background: input.background, size: input.size, outputFormat: input.outputFormat } as SunburstSettings;
}

// OpenAI GPT Image 2.6 size constraints, shared by the editor and server.
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
  quality: zenmuxImageQualities, background: imageBackgrounds, size: sunburstSizeChoices, outputFormat: sunburstFormats('openai'), resolution: sunburstResolutions, complexity: apimartComplexities,
};

export function sunburstParameterData(field: SunburstParameter, value: string, provider: SunburstProvider = 'openai') {
  const choices: readonly string[] = field === 'provider' ? sunburstProviders : field === 'variant' ? sunburstVariants : field === 'quality' ? sunburstQualities(provider) : field === 'outputFormat' ? sunburstFormats(provider) : field === 'size' && provider === 'apimart' ? apimartAspectRatios : sunburstChoices[field];
  return { label: sunburstFieldLabels[field], model: value, options: choices.includes(value) ? [...choices] : [value, ...choices], parameter: field };
}

export function validateSunburstImageInputs(outputFormat: string, hasImages: boolean, hasMask: boolean, provider: SunburstProvider = 'openai') {
  if (provider === 'apimart' && hasMask) throw new Error('APIMart 不支持 Mask 蒙版，请断开蒙版或切换渠道。');
  if ((outputFormat === 'svg' || outputFormat === 'gif') && (hasImages || hasMask)) throw new Error(`${outputFormat.toUpperCase()} 仅支持文字生成，请断开参考图片和蒙版后再运行。`);
}

// Only convert known presets when the user changes a local provider. Connected
// values remain untouched and must pass the selected provider's own validation.
export function sunburstProviderSettings(data: SunburstSettings, provider: SunburstProvider): Partial<SunburstSettings> {
  const preset = sunburstSizePreset(data.size);
  const index = preset ? imageSizes.indexOf(preset.ratio) : -1;
  const ratio = index >= 0 ? imageSizeLabels[index] : data.size;
  const size = provider === 'apimart'
    ? apimartAspectRatios.some(item => item === ratio) ? ratio : 'auto'
    : apimartAspectRatios.some(item => item !== 'auto' && item === data.size)
      ? sunburstPresetSize(imageSizes[imageSizeLabels.indexOf(data.size)], data.resolution ?? '1K') : data.size;
  return { size, ...(!sunburstQualities(provider).includes(data.quality) ? { quality: 'high' } : {}),
    ...(!sunburstFormats(provider).includes(data.outputFormat) ? { outputFormat: 'png' } : {}),
    ...(provider === 'apimart' ? { resolution: preset?.resolution ?? data.resolution ?? '1K' } : {}),
  };
}
