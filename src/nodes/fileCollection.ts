import { isImageGeneratorNode } from './types.ts';
import type { AppNode, FileAsset, FileNode, ImageIteratorNode, ImageGeneratorNode } from './types';

export const fileAssets = (data: FileNode['data']): FileAsset[] => data.assets ?? (data.asset ? [data.asset] : []);
export function orderedAssets(data: FileNode['data']) {
  const assets = fileAssets(data);
  return data.orderBy === 'name' ? [...assets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : assets;
}
export function fileOutputKind(data: FileNode['data']) {
  const assets = fileAssets(data);
  return assets.length && assets.every((asset) => asset.kind === assets[0].kind) ? assets[0].kind : 'file';
}
export const filePortColors = { file: 'var(--media-port-file, #f3ffe3)', image: 'var(--media-port-image, #97ffcd)', video: 'var(--media-port-video, #a7b5ff)', audio: 'var(--media-port-audio, #ffce94)', '3d': 'var(--media-port-3d, #ffadce)' };
export function fileNodeTitle(data: FileNode['data']) {
  const assets = fileAssets(data);
  if (data.label) return data.label;
  if (!assets.length) return '文件';
  if (assets.length === 1) return assets[0].name;
  return `${assets.length} ${assets.every((asset) => asset.kind === 'image') ? '张图片' : '个文件'}`;
}

// Move, rather than duplicate, an asset. One state update gives undo one atomic edit.
export function extractFileAsset(nodes: AppNode[], sourceId: string, assetId: string, position: { x: number; y: number }, newId: string): AppNode[] {
  const source = nodes.find((node) => node.id === sourceId && (node.type === 'file' || node.type === 'image-iterator' || isImageGeneratorNode(node))) as FileNode | ImageIteratorNode | ImageGeneratorNode | undefined;
  if (!source || source.data.locked) return nodes;
  const assets = isImageGeneratorNode(source) ? source.data.results ?? [] : fileAssets(source.data);
  const asset = assets.find((item) => item.id === assetId);
  if (!asset || assets.length < 2) return nodes;
  const remaining = assets.filter((item) => item.id !== assetId);
  return [...nodes.map((node) => node.id === sourceId ? isImageGeneratorNode(source) ? {
    ...source, selected: false, data: { ...source.data, results: remaining,
      activeResultId: remaining.some(item => item.id === source.data.activeResultId) ? source.data.activeResultId : remaining[remaining.length - 1].id },
  } as ImageGeneratorNode : {
    ...source, selected: false, data: { ...source.data, asset: undefined, assets: remaining,
      activeAssetId: source.data.activeAssetId === assetId ? remaining[0].id : source.data.activeAssetId },
  } : { ...node, selected: false }), {
    id: newId, type: 'file', position, selected: true, data: { assets: [asset] },
  }];
}
export function isFileAsset(value: unknown): value is FileAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Partial<FileAsset>;
  return typeof asset.id === 'string' && typeof asset.name === 'string' && typeof asset.url === 'string'
    && /^(blob:|https?:)/.test(asset.url) && ['image', 'video', 'audio', '3d'].includes(asset.kind ?? '');
}
