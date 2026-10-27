import { decodeMask, type MaskBitmap, type MaskSelection } from './masksExtractor';

export function maskCanvas(bitmap: MaskBitmap, color?: [number, number, number]) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(bitmap.width, bitmap.height);
  for (let i = 0; i < bitmap.pixels.length; i++) {
    const selected = Boolean(bitmap.pixels[i]), offset = i * 4;
    image.data[offset] = color ? color[0] : selected ? 255 : 0;
    image.data[offset + 1] = color ? color[1] : selected ? 255 : 0;
    image.data[offset + 2] = color ? color[2] : selected ? 255 : 0;
    image.data[offset + 3] = color ? selected ? 120 : 0 : 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法导出蒙版。')), 'image/png'));
}

export async function renderMasks(image: HTMLImageElement, selection: MaskSelection) {
  const width = image.naturalWidth, height = image.naturalHeight;
  const mask = document.createElement('canvas'); mask.width = width; mask.height = height;
  const context = mask.getContext('2d')!;
  context.drawImage(maskCanvas(decodeMask(selection)), 0, 0, width, height);
  const maskBlob = await png(mask);
  // Convert luminance to alpha for the cutout; the public Mask output remains B/W.
  const pixels = context.getImageData(0, 0, width, height);
  for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i + 3] = pixels.data[i];
  context.putImageData(pixels, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.drawImage(image, 0, 0);
  const resultBlob = await png(mask);
  return { maskBlob, resultBlob, width, height };
}
