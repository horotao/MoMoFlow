import { isImageGeneratorNode } from './types.ts';
import type { AppNode, FileAsset, FileNode, ImageGeneratorNode } from './types';

export const fileAssets = (data: FileNode['data']): FileAsset[] => data.assets ?? (data.asset ? [data.asset] : []);
export function orderedAssets(data: FileNode['data']) {
  const assets = fileAssets(data);
  return data.orderBy === 'name' ? [...assets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : assets;
}
export const activeFileAsset = (data: FileNode['data'], assets = orderedAssets(data)) => assets.find(asset => asset.id === data.activeAssetId) ?? assets[0];
export function fileOutputKind(data: FileNode['data']) {
  const assets = fileAssets(data);
  return assets.length && assets.every((asset) => asset.kind === assets[0].kind) ? assets[0].kind : 'file';
}
export function fileNodeTitle(data: FileNode['data']) {
  const assets = fileAssets(data);
  if (data.label) return data.label;
  if (!assets.length) return '文件';
  if (assets.length === 1) return assets[0].name;
  return `${assets.length} ${assets.every((asset) => asset.kind === 'image') ? '张图片' : '个文件'}`;
}

// Move, rather than duplicate, an asset. One state update gives undo one atomic edit.
export function extractFileAsset(nodes: AppNode[], sourceId: string, assetId: string, position: { x: number; y: number }, newId: string): AppNode[] {
  const source = nodes.find((node) => node.id === sourceId && (node.type === 'file' || isImageGeneratorNode(node))) as FileNode | ImageGeneratorNode | undefined;
  if (!source || source.data.locked) return nodes;
  const assets = isImageGeneratorNode(source) ? source.data.results ?? [] : fileAssets(source.data);
  const asset = assets.find((item) => item.id === assetId);
  if (!asset || assets.length < 2) return nodes;
  const remaining = assets.filter((item) => item.id !== assetId);
  const annotations = 'annotations' in source.data ? source.data.annotations?.filter(history => history.imageId === assetId) : undefined;
  return [...nodes.map((node) => node.id === sourceId ? isImageGeneratorNode(source) ? {
    ...source, selected: false, data: { ...source.data, results: remaining,
      ...(annotations?.length ? { annotations: source.data.annotations?.filter(history => history.imageId !== assetId) } : {}),
      activeResultId: remaining.some(item => item.id === source.data.activeResultId) ? source.data.activeResultId : remaining[remaining.length - 1].id },
  } as ImageGeneratorNode : {
    ...source, selected: false, data: { ...source.data, asset: undefined, assets: remaining,
      ...(annotations?.length && source.type === 'file' ? { annotations: source.data.annotations?.filter(history => history.imageId !== assetId) } : {}),
      activeAssetId: source.data.activeAssetId === assetId ? remaining[0].id : source.data.activeAssetId },
  } : { ...node, selected: false }), {
    id: newId, type: 'file', position, selected: true, data: { assets: [asset], ...(annotations?.length ? { annotations } : {}) },
  }];
}
export function isFileAsset(value: unknown): value is FileAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Partial<FileAsset>;
  const basic = typeof asset.id === 'string' && typeof asset.name === 'string' && typeof asset.url === 'string'
    && /^(blob:|https?:)/.test(asset.url) && ['image', 'video', 'audio', '3d'].includes(asset.kind ?? '');
  if (!basic || !asset.crop) return basic;
  const { source, rect } = asset.crop;
  return Boolean(source && typeof source === 'object' && rect && typeof rect === 'object' && !('crop' in source) && isFileAsset(source) && source.kind === 'image'
    && Number.isInteger(source.width) && Number.isInteger(source.height) && source.width! > 0 && source.height! > 0
    && [rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)
    && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0
    && rect.x + rect.width <= source.width! && rect.y + rect.height <= source.height!);
}
