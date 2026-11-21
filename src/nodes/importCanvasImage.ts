import type { XYPosition } from '@xyflow/react';
import { assetResources } from './assetResources.ts';
import { anchorCanvasImage, hasImageDimensions } from './canvasImageGeometry.ts';
import { measureAsset } from './fileMedia.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { CanvasImage, FileAsset } from './types';

export async function readCanvasImage(file: File): Promise<FileAsset> {
  if (!file.size || (file.type && file.type !== 'application/octet-stream' && !file.type.startsWith('image/'))) {
    throw new Error(`无法导入「${file.name}」。请选择图片文件。`);
  }
  const url = assetResources.create(file);
  try {
    const asset = await measureAsset({ id: crypto.randomUUID(), kind: 'image', name: file.name,
      size: file.size, mimeType: file.type, createdAt: Date.now(), url });
    if (!hasImageDimensions(asset)) throw new Error(`无法读取「${file.name}」。`);
    return asset;
  } catch (error) {
    assetResources.discard([url]);
    throw error;
  }
}

export function createImportedCanvasImage(asset: FileAsset, position: XYPosition): CanvasImage {
  return anchorCanvasImage({
    id: crypto.randomUUID(), type: 'sunburst', position, selected: true,
    data: {
      ...defaultSunburstSettings, label: asset.name, imageSource: 'imported',
      imageInputs: 16, composer: { prompt: '', quantity: 1, ratio: 'auto' },
      results: [asset], activeResultId: asset.id,
    },
  });
}
