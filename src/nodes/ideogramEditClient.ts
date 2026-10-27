import { dataUrl, readImage } from './imageGenerationClient.ts';
import { validateIdeogramEditSettings, type IdeogramEditRequest } from './ideogram.ts';
import { normalizeIdeogramMask } from './ideogramMask.ts';

const maxTotal = 46 * 1024 * 1024;
export async function prepareIdeogramEditImages(input: IdeogramEditRequest, signal: AbortSignal) {
  validateIdeogramEditSettings(input, Boolean(input.mask));
  if (!Array.isArray(input.referenceImages) || input.referenceImages.length > (input.mask ? 3 : 4)) throw new Error('参考图最多 4 张，使用 Mask 时最多 3 张。');
  let total = 0;
  const read = async (url: string) => {
    const blob = await readImage(url, signal); total += blob.size;
    if (total > maxTotal) throw new Error('输入图片总大小不能超过 46 MiB。');
    return blob;
  };
  const image = await read(input.image), references: Blob[] = [];
  for (const url of input.referenceImages) references.push(await read(url));
  let mask = input.mask ? await read(input.mask) : undefined;
  if (mask) {
    const source = await createImageBitmap(image);
    try {
      const bitmap = await createImageBitmap(mask);
      const canvas = document.createElement('canvas');
      try {
        signal.throwIfAborted();
        if (bitmap.width !== source.width || bitmap.height !== source.height) throw new Error('Mask 尺寸必须与原图一致。');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('无法读取 Mask。');
        context.drawImage(bitmap, 0, 0);
        const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
        normalizeIdeogramMask(data.data, input.maskMode);
        context.putImageData(data, 0, 0);
        total -= mask.size;
        mask = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法导出 Mask。')), 'image/png'));
        total += mask.size;
        if (mask.size > 32 * 1024 * 1024 || total > maxTotal) throw new Error('转换后的 Mask 或输入图片总大小过大。');
      } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
    } finally { source.close(); }
  }
  signal.throwIfAborted();
  return { image: await dataUrl(image), referenceImages: await Promise.all(references.map(dataUrl)), ...(mask ? { mask: await dataUrl(mask) } : {}) };
}
