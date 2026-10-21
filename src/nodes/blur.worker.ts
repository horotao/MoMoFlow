import { blurPixels } from './blur';
import type { BlurReply, BlurRequest } from './blurProtocol';

const port = self as unknown as {
  onmessage: (event: MessageEvent<BlurRequest>) => void;
  postMessage: (message: BlurReply, transfer?: Transferable[]) => void;
};
let native: OffscreenCanvas, preview: OffscreenCanvas;
let context: OffscreenCanvasRenderingContext2D, previewContext: OffscreenCanvasRenderingContext2D;
let source: ImageData, draftSource: ImageData;
let lastSettings = '';
port.onmessage = async ({ data }) => {
  try {
    if (data.type === 'source') {
      try {
        native = new OffscreenCanvas(data.source.width, data.source.height);
        context = native.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(data.source, 0, 0);
        source = context.getImageData(0, 0, native.width, native.height);
        const scale = Math.min(1, 1024 / Math.max(native.width, native.height));
        preview = new OffscreenCanvas(Math.max(1, Math.round(native.width * scale)), Math.max(1, Math.round(native.height * scale)));
        previewContext = preview.getContext('2d')!;
        previewContext.drawImage(native, 0, 0, preview.width, preview.height);
        draftSource = previewContext.getImageData(0, 0, preview.width, preview.height);
      } finally { data.source.close(); }
      return;
    }
    if (data.draft && !data.exportPng) {
      const pixels = blurPixels(draftSource.data, preview.width, preview.height, data.settings, preview.width / native.width);
      previewContext.putImageData(new ImageData(pixels, preview.width, preview.height), 0, 0);
    } else {
      const key = JSON.stringify(data.settings);
      if (key !== lastSettings) {
        context.putImageData(new ImageData(blurPixels(source.data, native.width, native.height, data.settings), native.width, native.height), 0, 0);
        lastSettings = key;
      }
      previewContext.clearRect(0, 0, preview.width, preview.height);
      previewContext.drawImage(native, 0, 0, preview.width, preview.height);
    }
    const blob = data.exportPng ? await native.convertToBlob({ type: 'image/png' }) : undefined;
    const bitmap = preview.transferToImageBitmap();
    port.postMessage({ bitmap, blob, width: native.width, height: native.height }, [bitmap]);
  } catch {
    if (data.type === 'render') port.postMessage({ error: '无法处理模糊图片。' });
  }
};
