import { assetResources } from './assetResources';
import { readExecutionAsset } from './executionAssets';
import { defaultSunburstSettings } from './sunburst';
import type { FileAsset, ImageInpaintInput } from './types';

export const defaultInpaintBrushSize = 50;
export const inpaintSettings = { ...defaultSunburstSettings, provider: 'openai', variant: 'Sunburst', resolution: '1K' } as const;

export type InpaintBrushMode = 'paint' | 'erase';

export interface InpaintStroke {
  path: string;
  diameter: number;
  mode: InpaintBrushMode;
}

function drawInpaintSelection(context: CanvasRenderingContext2D, strokes: readonly InpaintStroke[], view: { width: number; height: number }) {
  context.save();
  context.scale(context.canvas.width / view.width, context.canvas.height / view.height);
  context.lineCap = context.lineJoin = 'round';
  for (const { path, diameter, mode } of strokes) {
    context.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
    context.lineWidth = diameter;
    context.stroke(new Path2D(path));
  }
  context.restore();
}

export function hasInpaintSelection(strokes: readonly InpaintStroke[], view: { width: number; height: number }) {
  const last = strokes[strokes.length - 1];
  if (!last) return false;
  if (last.mode === 'paint') return true;
  const scale = Math.min(1, 1024 / Math.max(view.width, view.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(view.width * scale));
  canvas.height = Math.max(1, Math.round(view.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return false;
  drawInpaintSelection(context, strokes, view);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  // Subpixel edges left by erasing over the same path do not form a selection.
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] >= 128) return true;
  }
  return false;
}

function encodePng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('无法导出重绘所需的 PNG。'));
  }, 'image/png'));
}

export async function prepareInpaintInput(source: FileAsset, strokes: readonly InpaintStroke[],
  view: { width: number; height: number }, signal: AbortSignal): Promise<ImageInpaintInput> {
  const { blob } = await readExecutionAsset(source.url, signal);
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    signal.throwIfAborted();
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法准备局部重绘图片。');
    let image = blob;
    if (blob.type !== 'image/png') {
      context.drawImage(bitmap, 0, 0);
      image = await encodePng(canvas);
    }
    context.clearRect(0, 0, width, height);
    drawInpaintSelection(context, strokes, view);
    // The API edits transparent pixels, so fill the inverse of the selection.
    context.globalCompositeOperation = 'source-out';
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    const mask = await encodePng(canvas);
    signal.throwIfAborted();
    if (image.size > 32 * 1024 * 1024 || mask.size > 32 * 1024 * 1024 || image.size + mask.size > 46 * 1024 * 1024) {
      throw new Error('原图与蒙版超出图片大小限制，请缩小原图后重试。');
    }
    const name = source.name.replace(/\.[^.]+$/, '');
    const asset = (file: Blob, name: string): FileAsset => ({
      id: crypto.randomUUID(), name, kind: 'image', url: assetResources.create(file),
      width, height, size: file.size, mimeType: 'image/png',
    });
    return {
      image: blob === image && source.url.startsWith('blob:')
        ? { ...source, crop: undefined, width, height, mimeType: 'image/png' }
        : asset(image, `${name}.png`),
      mask: asset(mask, `${name}-mask.png`),
    };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
