import { graphicPadding, isGraphicSource } from '../compositorGraphics';
import { drawGraphic, ensureGraphicFonts } from './drawGraphic';
import { compositorLayout, layerAsset, MAX_COMPOSITOR_EDGE, MAX_COMPOSITOR_PIXELS, type CompositorDocument, type CompositorInputs } from '../compositor';
import { CompositorEffectCache, compositorPixels } from './effects';
import { drawCompositor } from './renderScene';
import { CompositorRasterCache, effectRasterKey } from './renderCache';

export type RenderRequest = { id: number; document: CompositorDocument; inputs: CompositorInputs; draft: boolean };
const port = self as unknown as { onmessage: ((event: MessageEvent<RenderRequest>) => void) | null; postMessage: (value: unknown, transfer?: Transferable[]) => void };
const sources = new Map<string, ImageBitmap>();
const processed = new CompositorRasterCache<OffscreenCanvas>(MAX_COMPOSITOR_PIXELS);
const draftEffects = new CompositorEffectCache();
port.onmessage = async ({ data: request }) => {
  try {
    const { document, inputs, draft } = request;
    const urls = new Set(document.layers.filter(layer => layer.visible || (document.canvas.autoSize && layer.source.kind === 'input' && layer.source.handle === 'background')).map(layer => layerAsset(layer, inputs)?.url).filter((url): url is string => Boolean(url)));
    for (const [url, bitmap] of sources) if (!urls.has(url)) { bitmap.close(); sources.delete(url); }
    const graphicKey = (layer: typeof document.layers[number]) => JSON.stringify(['graphic', layer.id, layer.source, layer.transform?.width, layer.transform?.height, layer.stroke, graphicPadding(layer)]);
    processed.prune(new Set(document.layers.flatMap(layer => { const asset = layerAsset(layer, inputs); return asset ? [asset.url] : isGraphicSource(layer.source) ? [graphicKey(layer)] : []; })));
    await ensureGraphicFonts(document.layers.filter(layer => layer.visible).map(layer => layer.source).filter(isGraphicSource));
    const sizes: Record<string, { width: number; height: number }> = {};
    let scenePixels = 0;
    for (const url of urls) {
      let bitmap = sources.get(url);
      if (!bitmap) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('无法读取素材，请检查图片链接和跨域访问权限。');
        bitmap = await createImageBitmap(await response.blob());
        if (bitmap.width * bitmap.height > MAX_COMPOSITOR_PIXELS || Math.max(bitmap.width, bitmap.height) > MAX_COMPOSITOR_EDGE) { bitmap.close(); throw new Error('素材超过 8192 边长或 32MP 限制，请先缩小图片。'); }
        sources.set(url, bitmap);
      }
      scenePixels += bitmap.width * bitmap.height;
      if (scenePixels > MAX_COMPOSITOR_PIXELS * 2) throw new Error('可见素材总像素超过 64MP，请缩小图片或隐藏部分图层。');
      sizes[url] = { width: bitmap.width, height: bitmap.height };
    }
    const layout = compositorLayout(document, inputs, sizes);
    if (layout.width * layout.height > MAX_COMPOSITOR_PIXELS || Math.max(layout.width, layout.height) > MAX_COMPOSITOR_EDGE) throw new Error('画布超过 8192 边长或 32MP 限制。');
    const images = new Map<string, CanvasImageSource>();
    const effectScenePixels = layout.layers.reduce((total, layer) => {
      if (!layer.visible || (!layer.asset && !isGraphicSource(layer.source)) || (!isGraphicSource(layer.source) && !layer.effects.some(effect => effect.enabled))) return total;
      const padding = graphicPadding(layer);
      const source = layer.asset ? sources.get(layer.asset.url)! : { width: layer.transform.width + padding * 2, height: layer.transform.height + padding * 2 };
      const scale = draft ? Math.min(1, 512 / Math.max(source.width, source.height)) : 1;
      return total + Math.max(1, Math.round(source.width * scale)) * Math.max(1, Math.round(source.height * scale));
    }, 0);
    if (effectScenePixels > MAX_COMPOSITOR_PIXELS * 2) throw new Error('带效果图层的处理像素总计超过 64MP，请缩小素材或停用部分图层效果。');
    for (const layer of layout.layers) {
      if (!layer.visible || (!layer.asset && !isGraphicSource(layer.source))) continue;
      let source: ImageBitmap | OffscreenCanvas;
      const sourceKey = layer.asset?.url ?? graphicKey(layer);
      if (isGraphicSource(layer.source)) {
        const t = layer.transform, padding = graphicPadding(layer), fullWidth = t.width + padding * 2, fullHeight = t.height + padding * 2;
        const rasterScale = draft ? Math.min(1, 512 / Math.max(fullWidth, fullHeight)) : 1;
        const width = Math.max(1, Math.ceil(fullWidth * rasterScale)), height = Math.max(1, Math.ceil(fullHeight * rasterScale));
        if (width * height > MAX_COMPOSITOR_PIXELS) throw new Error('矢量图层超过 32MP，请缩小图层。');
        const key = sourceKey + ':' + rasterScale;
        let raster = processed.get(key);
        if (!raster) {
          raster = new OffscreenCanvas(width, height);
          const context = raster.getContext('2d')!;
          context.scale(width / fullWidth, height / fullHeight);
          context.translate(padding, padding);
          drawGraphic(context, layer.source, t.width, t.height, layer.stroke);
          processed.set(key, sourceKey, raster);
        }
        source = raster;
      } else source = sources.get(layer.asset!.url)!;
      if (!layer.effects.some(effect => effect.enabled)) { images.set(layer.id, source); continue; }
      const scale = draft ? Math.min(1, 512 / Math.max(source.width, source.height)) : 1;
      const effectScale = isGraphicSource(layer.source) ? source.width / (layer.transform.width + graphicPadding(layer) * 2) * scale : scale;
      const key = effectRasterKey(sourceKey, layer.effects, effectScale);
      let processedCanvas = processed.get(key);
      if (!processedCanvas) {
        const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
        const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(source, 0, 0, width, height);
        const sourcePixels = context.getImageData(0, 0, width, height).data;
        const pixels = draft ? draftEffects.render(sourceKey, sourcePixels, width, height, layer.effects, effectScale)
          : compositorPixels(sourcePixels, width, height, layer.effects, effectScale);
        context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
        processedCanvas = canvas; processed.set(key, sourceKey, canvas);
      }
      images.set(layer.id, processedCanvas);
    }
    const scale = draft ? Math.min(1, 1024 / Math.max(layout.width, layout.height)) : 1;
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(layout.width * scale)), Math.max(1, Math.round(layout.height * scale)));
    drawCompositor(canvas.getContext('2d')!, document, layout, images, scale);
    const blob = draft ? undefined : await canvas.convertToBlob({ type: 'image/png' });
    const bitmap = canvas.transferToImageBitmap();
    port.postMessage({ id: request.id, bitmap, blob, layout }, [bitmap]);
  } catch (error) { port.postMessage({ id: request.id, error: error instanceof Error ? error.message : '合成失败，请检查图片素材。' }); }
  finally {
    // Bound retained memory after success and failure, including oversized scenes.
    let pixels = 0;
    for (const [url, image] of sources) { pixels += image.width * image.height; if (pixels > MAX_COMPOSITOR_PIXELS) { image.close(); sources.delete(url); } }
  }
};
