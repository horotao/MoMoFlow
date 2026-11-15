import { isFileAsset } from './fileCollection.ts';
import { apimartChannelModels, apimartSvgModels, apimartSvgEfforts, imageModerations, validateSunburstVariant, validateSunburstProvider, validateSunburstSettings } from './sunburst.ts';
import type { SunburstNode } from './types';

export function restoreSunburstData(value: unknown): SunburstNode['data'] | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (typeof data.size !== 'string') return;
  // Size inputs save unfinished edits. Restore their text without requiring a
  // runnable size; keep all other existing settings validation unchanged.
  const settings = validateSunburstSettings({ ...data, size: 'auto' });
  const provider = validateSunburstProvider(data.provider);
  const count = data.imageInputs;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 16) return;
  const results = data.results ?? [];
  if (!Array.isArray(results) || !results.every(isFileAsset)) return;
  return {
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
    label: typeof data.label === 'string' ? data.label : undefined,
    activeResultId: typeof data.activeResultId === 'string' && results.some(result => result.id === data.activeResultId)
      ? data.activeResultId : undefined,
  };
}
