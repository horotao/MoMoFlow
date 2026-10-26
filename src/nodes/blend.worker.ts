import { blendPixels } from './blend';
import type { BlendRequest, BlendReply } from './blendProtocol';
// Float storage avoids losing RGB when low-alpha pixels are premultiplied.
const contextSettings = { willReadFrequently: true, colorType: 'float16' } as const;
function contextFor(canvas: OffscreenCanvas) {
  const context = canvas.getContext('2d', contextSettings);
  // TypeScript's DOM library predates this OffscreenCanvas attribute API.
  const attributes = (context as (OffscreenCanvasRenderingContext2D & {
    getContextAttributes?: () => { colorType?: string };
  }) | null)?.getContextAttributes?.();
  if (!context || attributes?.colorType !== 'float16') {
    throw new Error('当前浏览器不支持高精度图片合成，请更新浏览器。');
  }
  return context;
}
const port = self as unknown as { onmessage: (event: MessageEvent<BlendRequest>) => void; postMessage: (message: BlendReply, transfer?: Transferable[]) => void };
let width = 1, height = 1;
let back: ImageData, front: ImageData, draftBack: ImageData, draftFront: ImageData;
let failure = '';
function pixels(image: ImageBitmap | undefined, w: number, h: number) {
  const canvas = new OffscreenCanvas(w, h), context = contextFor(canvas);
  if (image) context.drawImage(image, 0, 0, w, h);
  return context.getImageData(0, 0, w, h);
}
port.onmessage = async ({ data }) => {
  try {
    if (data.type === 'source') {
      try {
        const reference = data.back ?? data.front;
        if (!reference) throw new Error('Missing image');
        width = reference.width; height = reference.height;
        const scale = Math.min(1, 512 / Math.max(width, height));
        const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
        back = pixels(data.back, width, height); front = pixels(data.front, width, height);
        draftBack = pixels(data.back, w, h); draftFront = pixels(data.front, w, h);
      } finally { data.back?.close(); data.front?.close(); }
      return;
    }
    if (failure) throw new Error(failure);
    const b = data.draft ? draftBack : back, f = data.draft ? draftFront : front;
    const native = new OffscreenCanvas(b.width, b.height);
    contextFor(native).putImageData(new ImageData(blendPixels(b.data, f.data, data.settings), b.width, b.height), 0, 0);
    const blob = data.exportPng ? await native.convertToBlob({ type: 'image/png' }) : undefined;
    const scale = Math.min(1, 1024 / Math.max(native.width, native.height));
    const preview = new OffscreenCanvas(Math.max(1, Math.round(native.width * scale)), Math.max(1, Math.round(native.height * scale)));
    contextFor(preview).drawImage(native, 0, 0, preview.width, preview.height);
    const bitmap = preview.transferToImageBitmap();
    port.postMessage({ bitmap, blob, width, height }, [bitmap]);
  } catch (error) {
    if (data.type === 'source') failure = error instanceof Error ? error.message : '无法读取混合图片。';
    else port.postMessage({ error: failure || '无法合成图片。' });
  }
};
