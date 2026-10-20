import { correctPixels } from './colorCorrection';
import type { ColorReply, ColorRequest } from './colorCorrectionProtocol';

const port = self as unknown as {
  onmessage: (event: MessageEvent<ColorRequest>) => void;
  postMessage: (message: ColorReply, transfer?: Transferable[]) => void;
};
let native: OffscreenCanvas;
let context: OffscreenCanvasRenderingContext2D;
let source: ImageData;
let preview: OffscreenCanvas;
let previewContext: OffscreenCanvasRenderingContext2D;
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
      } finally { data.source.close(); }
      return;
    }
    const key = JSON.stringify(data.settings);
    if (key !== lastSettings) {
      const pixels = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
      correctPixels(pixels.data, data.settings);
      context.putImageData(pixels, 0, 0);
      lastSettings = key;
    }
    // Preview and PNG both start from these corrected native-resolution pixels.
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(native, 0, 0, preview.width, preview.height);
    const blob = data.exportPng ? await native.convertToBlob({ type: 'image/png' }) : undefined;
    const bitmap = preview.transferToImageBitmap();
    port.postMessage({ bitmap, blob, width: native.width, height: native.height }, [bitmap]);
  } catch {
    // Initialization has no response; the first render reports any failure.
    if (data.type === 'render') port.postMessage({ error: '无法处理调色图片。' });
  }
};
