import { levelsPixels, levelsHistogram, type LevelsHistogram } from './levels';
import type { LevelsReply, LevelsRequest } from './levelsProtocol';

const port = self as unknown as {
  onmessage: (event: MessageEvent<LevelsRequest>) => void;
  postMessage: (message: LevelsReply, transfer?: Transferable[]) => void;
};
let native: OffscreenCanvas, preview: OffscreenCanvas;
let context: OffscreenCanvasRenderingContext2D, previewContext: OffscreenCanvasRenderingContext2D;
let source: ImageData, draftSource: ImageData;
let lastSettings = '';
let histogram: LevelsHistogram, draftHistogram: LevelsHistogram, adjustedHistogram: LevelsHistogram;
port.onmessage = async ({ data }) => {
  try {
    if (data.type === 'source') {
      try {
        native = new OffscreenCanvas(data.source.width, data.source.height);
        context = native.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(data.source, 0, 0);
        source = context.getImageData(0, 0, native.width, native.height);
        histogram = levelsHistogram(source.data);
        const scale = Math.min(1, 1024 / Math.max(native.width, native.height));
        preview = new OffscreenCanvas(Math.max(1, Math.round(native.width * scale)), Math.max(1, Math.round(native.height * scale)));
        previewContext = preview.getContext('2d')!;
        previewContext.drawImage(native, 0, 0, preview.width, preview.height);
        draftSource = previewContext.getImageData(0, 0, preview.width, preview.height);
        draftHistogram = levelsHistogram(draftSource.data);
      } finally { data.source.close(); }
      return;
    }
    const isDraft = data.draft && !data.exportPng;
    let adjusted: LevelsHistogram;
    if (isDraft) {
      const pixels = levelsPixels(draftSource.data, data.settings);
      adjusted = levelsHistogram(pixels);
      previewContext.putImageData(new ImageData(pixels, preview.width, preview.height), 0, 0);
    } else {
      const key = JSON.stringify(data.settings);
      if (key !== lastSettings) {
        const pixels = levelsPixels(source.data, data.settings);
        adjustedHistogram = levelsHistogram(pixels);
        context.putImageData(new ImageData(pixels, native.width, native.height), 0, 0);
        lastSettings = key;
      }
      adjusted = adjustedHistogram;
      previewContext.clearRect(0, 0, preview.width, preview.height);
      previewContext.drawImage(native, 0, 0, preview.width, preview.height);
    }
    const blob = data.exportPng ? await native.convertToBlob({ type: 'image/png' }) : undefined;
    const bitmap = preview.transferToImageBitmap();
    port.postMessage({ histogram: { source: isDraft ? draftHistogram : histogram, adjusted }, bitmap, blob, width: native.width, height: native.height }, [bitmap]);
  } catch {
    if (data.type === 'render') port.postMessage({ error: '无法处理色阶图片。' });
  }
};
