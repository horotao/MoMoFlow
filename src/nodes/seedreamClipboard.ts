import { isFileAsset } from './fileCollection.ts';
import { seedreamMaxImages, validateSeedreamSettings } from './seedream.ts';
import type { SeedreamNode } from './types';

export function restoreSeedreamData(value: unknown): SeedreamNode['data'] | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  const settings = validateSeedreamSettings(data);
  if (typeof data.imageInputs !== 'number' || !Number.isInteger(data.imageInputs) || data.imageInputs < 1 || data.imageInputs > seedreamMaxImages) return;
  const results = data.results ?? [];
  if (!Array.isArray(results) || !results.every(asset => isFileAsset(asset) && asset.kind === 'image')) return;
  return {
    ...settings, imageInputs: data.imageInputs, results,
    ...(data.outputMode === 'fixed' ? { outputMode: 'fixed' as const } : {}),
    label: typeof data.label === 'string' ? data.label : undefined,
    ...(data.orderBy === 'date' || data.orderBy === 'name' ? { orderBy: data.orderBy } : {}),
    activeResultId: typeof data.activeResultId === 'string' && results.some(asset => asset.id === data.activeResultId) ? data.activeResultId : undefined,
  };
}
