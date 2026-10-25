import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type CompareData = {
  label?: string;
  locked?: boolean;
  mode: 'slider' | 'toggle';
  split: number;
  input1?: FileAsset;
  input2?: FileAsset;
};
export const defaultCompareData: CompareData = { mode: 'slider', split: .5 };
export const compareInput = (output?: string | null) => output === 'output-1' ? 'input-1' : output === 'output-2' ? 'input-2' : undefined;
export function restoreCompareData(value: unknown): CompareData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as CompareData;
  if (!['slider', 'toggle'].includes(data.mode) || !Number.isFinite(data.split) || data.split < 0 || data.split > 1
    || [data.input1, data.input2].some(asset => asset !== undefined && (!isFileAsset(asset) || asset.kind !== 'image'))) return;
  return { mode: data.mode, split: data.split, input1: data.input1, input2: data.input2,
    label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}
