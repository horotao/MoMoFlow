import type { FileAsset, FileNode } from './types';
import { fileAssets, isFileAsset } from './fileCollection.ts';

export const imageIteratorLimit = 50;
export const imageIteratorAccept = '.jpg,.jpeg,.png,.webp,.gif,.heic,.avif';
export type ImageIteratorData = FileNode['data'];
export type ImageIteration = {
  kind: 'image'; nodeId: string; itemId: string; index: number; total: number;
  name: string; signature: string; text?: never;
};
export const defaultImageIteratorData = (): ImageIteratorData => ({ assets: [], viewMode: 'all' });

// Blob URLs change after restoring a workflow; the asset/content identity does not.
export const imageIterationSignature = (asset: FileAsset) => JSON.stringify([
  asset.contentHash ?? asset.id, /^https?:/.test(asset.url) ? asset.url : undefined, asset.maskMode,
]);

export function validateImageIteratorAssets(assets: FileAsset[]) {
  if (!assets.length) throw new Error('请至少添加一张图片。');
  if (assets.length > imageIteratorLimit) throw new Error(`最多支持 ${imageIteratorLimit} 张图片。`);
  const ids = new Set<string>();
  for (const [index, asset] of assets.entries()) {
    if (!isFileAsset(asset) || asset.kind !== 'image' || !asset.id || ids.has(asset.id)) throw new Error(`第 ${index + 1} 项不是有效的独立图片。`);
    ids.add(asset.id);
  }
}

export function readImageIteratorData(value: unknown): ImageIteratorData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as ImageIteratorData;
  const assets = fileAssets(data);
  if (!Array.isArray(assets)) return;
  try { if (assets.length) validateImageIteratorAssets(assets); } catch { return; }
  return {
    assets: assets.map(asset => ({ ...asset })),
    label: typeof data.label === 'string' ? data.label : undefined,
    locked: data.locked === true,
    activeAssetId: typeof data.activeAssetId === 'string' ? data.activeAssetId : undefined,
    viewMode: data.viewMode === 'single' ? 'single' : 'all',
    orderBy: data.orderBy === 'name' ? 'name' : 'date',
  };
}
