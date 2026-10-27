export const ideogramModel = 'ideogram-ai/ideogram-v4.5';
export const ideogramEditModel = 'ideogram-ai/ideogram-v4.5/edit';
export const ideogramName = 'Ideogram 4.5';
export const ideogramAspectRatios = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'] as const;
export const ideogramResolutions = ['1k', '2k'] as const;
export const ideogramQualities = ['low', 'medium', 'high'] as const;
export type IdeogramSettings = {
  aspectRatio: typeof ideogramAspectRatios[number];
  resolution: typeof ideogramResolutions[number];
  quality: typeof ideogramQualities[number];
  enablePromptExpansion: boolean;
};
export const ideogramEditQualities = ['very_low', 'low', 'medium', 'high'] as const;
export const ideogramEditPrecisions = ['regular', 'high'] as const;
export type IdeogramEditSettings = {
  editQuality: typeof ideogramEditQualities[number];
  editPrecision: typeof ideogramEditPrecisions[number];
  editSize: string;
};
export type IdeogramField = keyof IdeogramSettings | keyof IdeogramEditSettings;
export type IdeogramEditRequest = IdeogramEditSettings & { prompt: string; image: string; referenceImages: string[]; mask?: string; maskMode?: 'luminance' };
export type IdeogramRequest = (IdeogramSettings & { prompt: string; image?: never; referenceImages?: never; mask?: never }) | IdeogramEditRequest;
// The model page has conflicting expansion defaults. Always send an explicit value.
export const defaultIdeogramSettings: IdeogramSettings = { aspectRatio: '1:1', resolution: '1k', quality: 'medium', enablePromptExpansion: true };
export const defaultIdeogramEditSettings: IdeogramEditSettings = { editQuality: 'medium', editPrecision: 'regular', editSize: 'auto' };
export const ideogramFieldLabels: Record<IdeogramField, string> = { aspectRatio: 'Aspect Ratio', resolution: 'Resolution', quality: 'Quality', enablePromptExpansion: 'Prompt Expansion', editQuality: 'Edit Quality', editPrecision: 'Edit Precision', editSize: 'Edit Size' };
export const ideogramChoices = { aspectRatio: ideogramAspectRatios, resolution: ideogramResolutions, quality: ideogramQualities, enablePromptExpansion: ['true', 'false'] as const, editQuality: ideogramEditQualities, editPrecision: ideogramEditPrecisions, editSize: ['auto', '1024*1024', '1536*1024', '1024*1536', '2048*2048'] as const };
export const ideogramGenerationFields: IdeogramField[] = ['aspectRatio', 'resolution', 'quality', 'enablePromptExpansion'];
export const ideogramEditFields: IdeogramField[] = ['editQuality', 'editPrecision', 'editSize'];
export const ideogramImageInputCount = (count: number) => Math.max(1, Math.min(5, Number.isInteger(count) ? count : 1));

export function validateIdeogramSettings(value: unknown): IdeogramSettings {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  if (!ideogramAspectRatios.some(option => option === input.aspectRatio)
    || !ideogramResolutions.some(option => option === input.resolution)
    || !ideogramQualities.some(option => option === input.quality)
    || typeof input.enablePromptExpansion !== 'boolean') throw new Error('不支持的 Ideogram 4.5 图片参数。');
  return { aspectRatio: input.aspectRatio, resolution: input.resolution, quality: input.quality, enablePromptExpansion: input.enablePromptExpansion } as IdeogramSettings;
}

export function validateIdeogramPrompt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > 10000) throw new Error('请为 Ideogram 4.5 连接非空提示词，最多 10000 个字符。');
  return value.trim();
}

export function validateIdeogramEditSize(value: unknown): string {
  if (value === 'auto') return value;
  const match = typeof value === 'string' ? value.match(/^(\d{3,4})\*(\d{3,4})$/) : null;
  if (!match) throw new Error('编辑尺寸需为宽×高，或跟随原图。');
  const width = Number(match[1]), height = Number(match[2]);
  if (width < 256 || height < 256 || width > 4992 || height > 4992 || width % 32 || height % 32
    || width * height > 4194304 || Math.max(width, height) / Math.min(width, height) > 6) {
    throw new Error('编辑尺寸须为 256–4992 的 32 倍数，最多 4194304 像素，长宽比不超过 6:1。');
  }
  return `${width}*${height}`;
}

export function validateIdeogramEditSettings(value: unknown, masked = false): IdeogramEditSettings {
  if (!value || typeof value !== 'object') throw new Error('编辑参数格式错误。');
  const input = value as Record<string, unknown>;
  const editQuality = input.editQuality ?? defaultIdeogramEditSettings.editQuality;
  const editPrecision = input.editPrecision ?? defaultIdeogramEditSettings.editPrecision;
  const editSize = validateIdeogramEditSize(input.editSize ?? 'auto');
  if (!ideogramEditQualities.some(option => option === editQuality) || !ideogramEditPrecisions.some(option => option === editPrecision)) throw new Error('不支持的 Ideogram 编辑参数。');
  if (editSize !== 'auto' && (masked || editPrecision === 'high')) throw new Error('使用 Mask 或高精度编辑时，输出尺寸必须跟随原图。');
  return { editQuality, editPrecision, editSize } as IdeogramEditSettings;
}

export function ideogramParameterData(field: IdeogramField, value: string) {
  const choices: readonly string[] = ideogramChoices[field];
  return { label: ideogramFieldLabels[field], model: value, options: choices.includes(value) ? [...choices] : [value, ...choices], parameter: field };
}
