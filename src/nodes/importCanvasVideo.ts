import type { XYPosition } from '@xyflow/react';
import { assetResources } from './assetResources.ts';
import { canvasImageSize } from './canvasImageGeometry.ts';
import type { CanvasVideo, FileAsset } from './types';

export const isMp4File = (file: File) => file.type === 'video/mp4'
  || ((!file.type || file.type === 'application/octet-stream') && /\.mp4$/i.test(file.name));

export async function readCanvasVideo(file: File): Promise<FileAsset> {
  if (!file.size || !isMp4File(file)) throw new Error('请选择 MP4 视频文件。');
  const url = assetResources.create(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error(`无法播放「${file.name}」，请检查视频文件或编码。`));
      const timeout = window.setTimeout(fail, 15000);
      video.onloadeddata = () => {
        window.clearTimeout(timeout);
        if (video.videoWidth && video.videoHeight && Number.isFinite(video.duration)) resolve();
        else fail();
      };
      video.onerror = () => { window.clearTimeout(timeout); fail(); };
      video.src = url;
    });
    return { id: crypto.randomUUID(), kind: 'video', name: file.name, mimeType: 'video/mp4', size: file.size, duration: video.duration,
      url, width: video.videoWidth, height: video.videoHeight, createdAt: Date.now() };
  } catch (error) {
    assetResources.discard([url]);
    throw error;
  } finally {
    video.onloadeddata = video.onerror = null;
    video.removeAttribute('src');
    video.load();
  }
}

export function createImportedVideo(asset: FileAsset, position: XYPosition): CanvasVideo {
  return { id: crypto.randomUUID(), type: 'video', origin: [.5, 0], selected: true,
    position: { x: position.x + canvasImageSize('auto', asset).width / 2, y: position.y },
    data: { label: asset.name, asset } };
}
