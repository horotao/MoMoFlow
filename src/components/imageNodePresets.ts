import {
  apimartFixedSettings, defaultSunburstSettings, imageSizeLabels, imageSizes, sunburstResolutions, sunburstSizePreset,
  validateApimartChannelModel, validateSunburstProvider, validateSunburstSettings, validateSunburstVariant,
} from '../nodes/sunburst.ts';
import { changeComposerSettings, composerAspectRatios } from '../nodes/imageComposerSettings.ts';
import { seedreamChoices } from '../nodes/seedream.ts';
import { nanoBananaImageSizes } from '../nodes/nanoBanana.ts';
import { defaultImagePromptModelSelection, imagePromptModels } from './image-prompt-node/imagePromptModels.ts';
import type { CanvasImage, ImageComposerData, SunburstNode } from '../nodes/types';

const storageKey = 'momoflow-sunburst-preset-v1';
const defaultSunburstPreset = {
  ...defaultSunburstSettings, ...apimartFixedSettings,
  provider: 'apimart', channelModel: 'gpt-image-2.6-ext', variant: 'Sunburst', size: '1:1', resolution: '1K',
} as const;

function modelSettings(value: ImageComposerData['modelSettings']) {
  const result: NonNullable<ImageComposerData['modelSettings']> = {};
  for (const model of imagePromptModels) {
    const saved = value?.[model.id];
    if (!saved || typeof saved !== 'object') continue;
    const choices: Record<string, readonly string[]> = model.id === 'seedream-5-5'
      ? { resolution: seedreamChoices.resolution, background: seedreamChoices.background, outputFormat: ['png', 'jpeg'] }
      : model.id.startsWith('nano-banana') ? { resolution: nanoBananaImageSizes, outputFormat: ['png', 'jpeg'] } : {};
    result[model.id] = Object.fromEntries(Object.entries(choices)
      .filter(([key, options]) => options.includes(saved[key])).map(([key]) => [key, saved[key]]));
  }
  return result;
}

// Whitelist generation preferences; never retain prompts, results or canvas state.
function normalizePreset(value: unknown): CanvasImage['data'] {
  const settings = validateSunburstSettings(value);
  const input = value as SunburstNode['data'];
  const provider = validateSunburstProvider(input.provider);
  const resolution = input.resolution ?? sunburstSizePreset(settings.size)?.resolution ?? '1K';
  if (!sunburstResolutions.includes(resolution)) throw new Error('无效的分辨率预设。');
  const saved = input.composer;
  const selection = saved?.selection ?? defaultImagePromptModelSelection;
  if (!Array.isArray(selection.modelIds) || !selection.modelIds.length
    || !selection.modelIds.every(id => imagePromptModels.some(model => model.id === id))
    || typeof selection.autoSelect !== 'boolean' || typeof selection.multiple !== 'boolean') throw new Error('无效的模型预设。');
  // Older presets contain API size only; recover their toolbar ratio as well.
  const sizePreset = sunburstSizePreset(settings.size);
  const index = sizePreset ? imageSizes.indexOf(sizePreset.ratio) : -1;
  const ratio = saved?.ratio ?? (index >= 0 ? imageSizeLabels[index] : settings.size.includes(':') ? settings.size : 'auto');
  const composer: ImageComposerData = {
    prompt: '', quantity: typeof saved?.quantity === 'number' && Number.isInteger(saved.quantity) && saved.quantity >= 1 && saved.quantity <= 20 ? saved.quantity : 1,
    ratio, selection: { ...selection, modelIds: [...selection.modelIds] }, modelSettings: modelSettings(saved?.modelSettings),
  };
  const data: CanvasImage['data'] = {
    ...settings, ...apimartFixedSettings, provider, resolution,
    channelModel: validateApimartChannelModel(input.channelModel), variant: validateSunburstVariant(input.variant),
    outputFormat: settings.outputFormat === 'webp' ? 'png' : settings.outputFormat,
    imageInputs: 16, composer,
  };
  if (!composerAspectRatios(data).includes(composer.ratio)) composer.ratio = 'auto';
  return { ...data, ...changeComposerSettings(data, { ratio: composer.ratio }) };
}

export const sunburstPreset = {
  newNodeData(): CanvasImage['data'] {
    try {
      const stored: unknown = JSON.parse(globalThis.localStorage?.getItem(storageKey) ?? 'null');
      if (stored) return normalizePreset(stored);
    } catch { /* A missing, invalid or unavailable preference falls back to factory defaults. */ }
    return normalizePreset(defaultSunburstPreset);
  },
  remember(data: SunburstNode['data']) {
    try {
      // Editing quality/resolution on a following node should not turn its
      // inferred ratio into the user's default for unrelated new nodes.
      const preferences = data.composer?.followReferenceRatio ? {
        ...data, composer: { ...data.composer, ratio: sunburstPreset.newNodeData().composer.ratio },
      } : data;
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(normalizePreset(preferences)));
    } catch { /* Keep editing when storage is unavailable; retain the last valid preference. */ }
  },
};
