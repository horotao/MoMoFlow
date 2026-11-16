export const sunburstProviders = ['openai', 'apimart'] as const;
export type SunburstProvider = typeof sunburstProviders[number];
export const sunburstProviderLabels: Record<SunburstProvider, string> = { openai: 'OpenAI 官方', apimart: 'APIMart' };

export function migrateSunburstProvider(value: unknown) {
  // The standard APIMart model keeps support for pixel sizes, SVG and raster masks.
  return value === 'zenmux' ? { provider: 'apimart', channelModel: 'gpt-image-2.6' } as const : undefined;
}

// Nodes saved before provider selection default to OpenAI.
export function validateSunburstProvider(value: unknown): SunburstProvider {
  if (value === undefined) return 'openai';
  if (value === 'openai' || value === 'apimart') return value;
  throw new Error('不支持的 GPT Image 2.6 渠道商。');
}

export const sunburstVariants = ['Sunburst', 'Flare'] as const;
export type SunburstVariant = typeof sunburstVariants[number];
export function validateSunburstVariant(value: unknown): SunburstVariant {
  if (value === undefined) return 'Sunburst';
  if (value === 'Sunburst' || value === 'Flare') return value;
  throw new Error('不支持的 GPT Image 2.6 模型版本。');
}

export const apimartChannelModels = ['gpt-image-2.6-ext', 'gpt-image-2.6'] as const;
export type ApimartChannelModel = typeof apimartChannelModels[number];
export function validateApimartChannelModel(value: unknown): ApimartChannelModel {
  if (value === undefined) return 'gpt-image-2.6-ext';
  if (value === 'gpt-image-2.6-ext' || value === 'gpt-image-2.6') return value;
  throw new Error('不支持的 APIMart 渠道模型。');
}

export function sunburstModelForProvider(provider: SunburstProvider, variant: SunburstVariant = 'Sunburst', channelModel?: ApimartChannelModel): string {
  if (provider === 'apimart' && validateApimartChannelModel(channelModel) === 'gpt-image-2.6-ext') return 'gpt-image-2.6-ext';
  return `gpt-image-2.6-${variant.toLowerCase()}`;
}

export const sunburstName = 'GPT Image 2.6';
export const imageQualities = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const imageQualityLabels: Record<typeof imageQualities[number], string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
export const imageBackgrounds = ['auto', 'transparent', 'opaque'] as const;
export const imageFormats = ['png', 'jpeg', 'webp', 'svg', 'gif'] as const;
export function sunburstFormats(provider: SunburstProvider, channelModel?: ApimartChannelModel): readonly typeof imageFormats[number][] {
  // The Ext documentation explicitly warns that SVG is currently unavailable.
  if (provider !== 'apimart') return ['png', 'jpeg', 'webp', 'svg'];
  return channelModel === 'gpt-image-2.6' ? imageFormats : ['png', 'jpeg', 'webp', 'gif'];
}
export const apimartAspectRatios = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9'] as const;
export const apimartStandardAspectRatios = [...apimartAspectRatios, '9:21', '2:1', '1:2', '3:1', '1:3'] as const;
export const apimartComplexities = ['auto', 'low', 'medium', 'high'] as const;
export const imageModerations = ['low', 'auto'] as const;
export const apimartSvgModels = ['gpt-6-luna', 'gpt-6.1-sol'] as const;
export const apimartSvgEfforts = ['auto', 'none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export function apimartSvgModelEfforts(model: unknown): readonly typeof apimartSvgEfforts[number][] {
  return model === 'gpt-6.1-sol' ? apimartSvgEfforts.filter(value => value !== 'none') : apimartSvgEfforts;
}
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
  channelModel?: ApimartChannelModel;
  moderation?: typeof imageModerations[number];
  frameCount?: number;
  svgModel?: typeof apimartSvgModels[number];
  svgEffort?: typeof apimartSvgEfforts[number];
};
export type SunburstParameter = keyof SunburstSettings | 'provider' | 'variant';
export const sunburstFieldLabels: Record<SunburstParameter, string> = { provider: 'Provider', variant: 'Model Version', quality: 'Quality', background: 'Background', size: 'Aspect Ratio', outputFormat: 'Output Format', resolution: 'Resolution', complexity: 'Complexity', channelModel: 'Channel Model', moderation: 'Moderation', frameCount: 'Frame Count', svgModel: 'SVG Model', svgEffort: 'SVG Effort' };
export const apimartFixedSettings = { complexity: 'auto', moderation: 'low' } as const;
export const sunburstParameterDefaults = { provider: 'openai', variant: 'Sunburst', resolution: '1K', ...apimartFixedSettings, channelModel: 'gpt-image-2.6-ext', frameCount: 9, svgModel: 'gpt-6-luna', svgEffort: 'auto' } as const;
export function sunburstLocalParameter(data: SunburstSettings & { provider?: SunburstProvider; variant?: string }, field: SunburstParameter): string {
  return String(data[field] ?? (field in sunburstParameterDefaults ? sunburstParameterDefaults[field as keyof typeof sunburstParameterDefaults] : 'auto'));
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
  const channelModel = provider === 'apimart' ? validateApimartChannelModel(input.channelModel) : undefined;
  const standard = channelModel === 'gpt-image-2.6';
  validateSunburstVariant(input.variant);
  if (!imageQualities.some(v => v === input.quality) || ((provider !== 'apimart' || standard) && !imageBackgrounds.some(v => v === input.background))
    || !imageFormats.some(v => v === input.outputFormat)) throw new Error('不支持的图片参数。');
  if (!sunburstFormats(provider, channelModel).some(v => v === input.outputFormat)) throw new Error(`${sunburstProviderLabels[provider]} 暂不支持此输出格式。`);
  if (provider === 'apimart') {
    if (!standard && !apimartAspectRatios.some(v => v === input.size)) throw new Error('APIMart EXT 仅支持预设宽高比，不支持自定义宽高或像素尺寸。');
    const resolution = input.resolution ?? '1K';
    if (!sunburstResolutions.some(v => v === resolution)) throw new Error('APIMart 分辨率仅支持 1K、2K 或 4K。');
    // Removed controls cannot be overridden by older saved values or requests.
    const settings = { quality: input.quality, background: 'auto', size: input.size, outputFormat: input.outputFormat, resolution, ...apimartFixedSettings, channelModel } as SunburstSettings;
    if (!standard) {
      if (input.outputFormat === 'gif' && input.size !== 'auto') throw new Error('GIF 输出的宽高比只能选择自动。');
      return settings;
    }
    const extras: Partial<SunburstSettings> = { background: input.background as SunburstSettings['background'] };
    if (input.background === 'transparent' && !['png', 'webp', 'svg'].includes(String(input.outputFormat))) throw new Error('透明背景需要 PNG、WebP 或 SVG 格式。');
    if (input.outputFormat === 'gif') {
      const frameCount = input.frameCount === undefined ? 9 : typeof input.frameCount === 'string' && /^\d+$/.test(input.frameCount) ? Number(input.frameCount) : input.frameCount;
      if (typeof frameCount !== 'number' || !Number.isInteger(frameCount) || frameCount < 2 || frameCount > 16) throw new Error('GIF 帧数必须为 2–16 的整数。');
      validateApimartGifSize(input.size, frameCount);
      extras.frameCount = frameCount;
    } else if (!apimartStandardAspectRatios.some(v => v === input.size)) validateSunburstSize(input.size);
    if (input.outputFormat === 'svg') {
      const svgModel = input.svgModel ?? 'gpt-6-luna';
      const svgEffort = input.svgEffort ?? 'auto';
      if (!apimartSvgModels.some(v => v === svgModel)) throw new Error('不支持的 SVG 写作模型。');
      if (!apimartSvgModelEfforts(svgModel).some(v => v === svgEffort)) throw new Error('SVG 写作模型不支持此 effort。');
      extras.svgModel = svgModel as SunburstSettings['svgModel'];
      extras.svgEffort = svgEffort as SunburstSettings['svgEffort'];
    }
    return { ...settings, ...extras };
  }
  validateSunburstSize(input.size);
  if (input.background === 'transparent' && input.outputFormat === 'jpeg') throw new Error('透明背景需要 PNG 或 WebP 格式。');
  return { quality: input.quality, background: input.background, size: input.size, outputFormat: input.outputFormat } as SunburstSettings;
}

export function validateApimartGifSize(size: unknown, frameCount = 9): string {
  if (size === 'auto') return size;
  if (typeof size !== 'string' || !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(size)) throw new Error('GIF 请选择自动或自定义单帧像素尺寸。');
  const [width, height] = size.split('x').map(Number);
  if (width % 16 || height % 16) throw new Error('GIF 单帧宽高都必须是 16 的倍数。');
  const [columns, rows] = frameCount <= 8 ? [4, 2] : frameCount === 9 ? [3, 3] : frameCount <= 12 ? [4, 3] : [4, 4];
  const fits = (x: number, y: number) => x <= 3840 && y <= 3840 && x * y <= 8294400 && Math.max(x, y) <= Math.min(x, y) * 3;
  if (!fits(width * columns, height * rows) && !fits(width * rows, height * columns)) throw new Error('GIF 拼图超出尺寸限制，请减小单帧尺寸或帧数。');
  return size;
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
  quality: imageQualities, background: imageBackgrounds, size: sunburstSizeChoices, outputFormat: sunburstFormats('openai'), resolution: sunburstResolutions, complexity: apimartComplexities,
  channelModel: apimartChannelModels, moderation: imageModerations, frameCount: Array.from({ length: 15 }, (_, i) => String(i + 2)), svgModel: apimartSvgModels, svgEffort: apimartSvgEfforts,
};

export function sunburstParameterData(field: SunburstParameter, value: string, provider: SunburstProvider = 'openai', settings: Partial<SunburstSettings> = {}) {
  let choices: readonly string[];
  if (field === 'provider') choices = sunburstProviders;
  else if (field === 'variant') choices = sunburstVariants;
  else if (field === 'outputFormat') choices = sunburstFormats(provider, settings.channelModel);
  else if (field === 'svgEffort') choices = apimartSvgModelEfforts(settings.svgModel);
  else if (field === 'size' && provider === 'apimart') {
    choices = settings.channelModel !== 'gpt-image-2.6' ? apimartAspectRatios
      : settings.outputFormat === 'gif' ? ['auto', '512x512'] : apimartStandardAspectRatios;
  } else choices = sunburstChoices[field];
  return { label: sunburstFieldLabels[field], model: value, options: choices.includes(value) ? [...choices] : [value, ...choices], parameter: field };
}

export function validateSunburstImageInputs(outputFormat: string, hasImages: boolean, hasMask: boolean, provider: SunburstProvider = 'openai', channelModel?: ApimartChannelModel) {
  if (provider === 'apimart' && channelModel === 'gpt-image-2.6') {
    if (['gif', 'svg'].includes(outputFormat) && hasMask) throw new Error(`${outputFormat.toUpperCase()} 不支持 Mask 蒙版，请断开蒙版后再运行。`);
    return;
  }
  if (provider === 'apimart' && hasMask) throw new Error('APIMart EXT 不支持 Mask 蒙版，请断开蒙版或切换渠道模型。');
  if ((outputFormat === 'svg' || outputFormat === 'gif') && (hasImages || hasMask)) throw new Error(`${outputFormat.toUpperCase()} 仅支持文字生成，请断开参考图片和蒙版后再运行。`);
}

// Only convert known presets when the user changes a local provider. Connected
// values remain untouched and must pass the selected provider's own validation.
export function sunburstProviderSettings(data: SunburstSettings, provider: SunburstProvider, channelModel = data.channelModel): Partial<SunburstSettings> {
  const preset = sunburstSizePreset(data.size);
  const index = preset ? imageSizes.indexOf(preset.ratio) : -1;
  const ratio = index >= 0 ? imageSizeLabels[index] : data.size;
  const standard = channelModel === 'gpt-image-2.6';
  let size = data.size;
  if (provider === 'apimart') {
    if (standard) {
      if (data.outputFormat === 'gif' || !(apimartStandardAspectRatios.some(item => item === size) || /^\d+x\d+$/.test(size))) size = 'auto';
    } else size = apimartAspectRatios.some(item => item === ratio) ? ratio : 'auto';
  } else if (apimartStandardAspectRatios.some(item => item !== 'auto' && item === size)) {
    const resolution = data.resolution ?? '1K';
    size = size === '9:21' ? { '1K': '864x2016', '2K': '1152x2688', '4K': '1648x3840' }[resolution]
      : sunburstPresetSize(imageSizes[imageSizeLabels.indexOf(size)], resolution);
  } else if (data.outputFormat === 'gif') {
    try { validateSunburstSize(size); } catch { size = 'auto'; }
  }
  return { size,
    ...(!sunburstFormats(provider, channelModel).includes(data.outputFormat) ? { outputFormat: 'png' } : {}),
    ...(provider === 'apimart' ? { resolution: preset?.resolution ?? data.resolution ?? '1K', ...apimartFixedSettings } : {}),
  };
}

export function sunburstHiddenParameters(provider: unknown, channelModel: unknown, outputFormat: unknown): string[] {
  if (provider !== 'apimart') return ['channelModel', 'resolution', 'complexity', 'moderation', 'frameCount', 'svgModel', 'svgEffort'];
  if (channelModel !== 'gpt-image-2.6') return ['background', 'complexity', 'moderation', 'frameCount', 'svgModel', 'svgEffort'];
  return ['complexity', 'moderation', ...(outputFormat === 'gif' ? ['resolution'] : ['frameCount']), ...(outputFormat !== 'svg' ? ['svgModel', 'svgEffort'] : [])];
}
