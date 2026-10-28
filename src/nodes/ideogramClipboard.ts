import { isFileAsset } from './fileCollection.ts';
import { ideogramImageInputCount, validateIdeogramEditSize, validateIdeogramEditSettings, validateIdeogramSettings } from './ideogram.ts';
import type { IdeogramNode } from './types';

export function restoreIdeogramData(value: unknown): IdeogramNode['data'] | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  const settings = validateIdeogramSettings(data);
  const results = data.results ?? [];
  if (!Array.isArray(results) || !results.every(asset => isFileAsset(asset) && asset.kind === 'image')) return;
  return {
    ...settings, ...validateIdeogramEditSettings({ ...data, editSize: 'auto' }), editSize: validateIdeogramEditSize(data.editSize ?? 'auto'), imageInputs: ideogramImageInputCount(Number(data.imageInputs)), results,
    ...(data.outputMode === 'fixed' ? { outputMode: 'fixed' as const } : {}),
    label: typeof data.label === 'string' ? data.label : undefined,
    ...(data.orderBy === 'date' || data.orderBy === 'name' ? { orderBy: data.orderBy } : {}),
    activeResultId: typeof data.activeResultId === 'string' && results.some(asset => asset.id === data.activeResultId) ? data.activeResultId : undefined,
  };
}
