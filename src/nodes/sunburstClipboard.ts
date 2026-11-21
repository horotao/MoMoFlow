import { isFileAsset } from './fileCollection.ts';
import { restoreFileAnnotations } from './interactiveEdit.ts';
import { apimartChannelModels, apimartSvgModels, apimartSvgEfforts, imageModerations, migrateSunburstProvider, validateSunburstVariant, validateSunburstProvider, validateSunburstSettings } from './sunburst.ts';
import { imagePromptModels } from '../components/image-prompt-node/imagePromptModels.ts';
import { imagePromptAspectRatioGroups } from '../components/image-prompt-node/imagePromptAspectRatios.ts';
import type { ImageComposerData, SunburstNode } from './types';

function restoreComposer(value: unknown): ImageComposerData | undefined {
  if (!value || typeof value !== 'object') return;
  const { prompt, quantity, ratio, selection } = value as Partial<ImageComposerData>;
  if (typeof prompt !== 'string' || typeof quantity !== 'number' || !Number.isInteger(quantity)
    || quantity < 1 || quantity > 20 || typeof ratio !== 'string'
    || !imagePromptAspectRatioGroups.some(group => group.values.some(value => value === ratio))) return;
  if (selection && (!Array.isArray(selection.modelIds) || !selection.modelIds.every(id => imagePromptModels.some(model => model.id === id))
    || typeof selection.autoSelect !== 'boolean' || typeof selection.multiple !== 'boolean')) return;
  return { prompt, quantity, ratio, selection };
}

export function restoreSunburstData(value: unknown): SunburstNode['data'] | undefined {
  if (!value || typeof value !== 'object') return;
  const raw = value as Record<string, unknown>;
  const data: Record<string, unknown> = { ...raw, ...migrateSunburstProvider(raw.provider) };
  if (typeof data.size !== 'string') return;
  // Size inputs save unfinished edits. Restore their text without requiring a
  // runnable size; keep all other existing settings validation unchanged.
  const settings = validateSunburstSettings({ ...data, size: 'auto' });
  const provider = validateSunburstProvider(data.provider);
  const count = data.imageInputs;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 16) return;
  const results = data.results ?? [];
  if (!Array.isArray(results) || !results.every(isFileAsset)) return;
  const composer = restoreComposer(data.composer);
  return {
    ...(composer ? { composer, ...(data.imageSource === 'imported' ? { imageSource: 'imported' as const } : {}) } : {}),
    ...(apimartChannelModels.some(value => value === data.channelModel) ? { channelModel: data.channelModel as SunburstNode['data']['channelModel'] } : {}),
    ...(imageModerations.some(value => value === data.moderation) ? { moderation: data.moderation as SunburstNode['data']['moderation'] } : {}),
    ...(typeof data.frameCount === 'number' && Number.isInteger(data.frameCount) && data.frameCount >= 2 && data.frameCount <= 16 ? { frameCount: data.frameCount } : {}),
    ...(apimartSvgModels.some(value => value === data.svgModel) ? { svgModel: data.svgModel as SunburstNode['data']['svgModel'] } : {}),
    ...(apimartSvgEfforts.some(value => value === data.svgEffort) ? { svgEffort: data.svgEffort as SunburstNode['data']['svgEffort'] } : {}),
    ...settings, size: data.size, imageInputs: count, results,
    ...(data.provider !== undefined ? { provider } : {}),
    ...(data.variant !== undefined ? { variant: validateSunburstVariant(data.variant) } : {}),
    ...(data.orderBy === 'date' || data.orderBy === 'name' ? { orderBy: data.orderBy } : {}),
    ...(data.outputMode === 'fixed' ? { outputMode: 'fixed' as const } : {}),
    ...(data.annotations !== undefined ? { annotations: restoreFileAnnotations(data.annotations, results) } : {}),
    label: typeof data.label === 'string' ? data.label : undefined,
    activeResultId: typeof data.activeResultId === 'string' && results.some(result => result.id === data.activeResultId)
      ? data.activeResultId : undefined,
  };
}
