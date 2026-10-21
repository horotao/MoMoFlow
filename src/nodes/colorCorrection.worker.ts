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
let draftSource: ImageData;
let draftPixels: ImageData;
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
        draftPixels = new ImageData(preview.width, preview.height);
      } finally { data.source.close(); }
      return;
    }
    if (data.draft && !data.exportPng) {
      // Interactive frames are disposable approximations. Never update the
      // native canvas/cache: the same settings must still render fully on release.
      draftPixels.data.set(draftSource.data);
      correctPixels(draftPixels.data, data.settings);
      previewContext.putImageData(draftPixels, 0, 0);
      const bitmap = preview.transferToImageBitmap();
      port.postMessage({ bitmap, width: native.width, height: native.height }, [bitmap]);
      return;
    }
    const key = JSON.stringify(data.settings);
    if (key !== lastSettings) {
      const pixels = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
      correctPixels(pixels.data, data.settings);
      context.putImageData(pixels, 0, 0);
      lastSettings = key;
    }
    // Committed preview and PNG start from identical native-resolution pixels.
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
