import { isCompositorNode, isBlendNode, isColorPaletteNode, isPainterNode, isMasksExtractorNode, isBlurNode, isLevelsNode, isColorCorrectionNode, isMatteGrowShrinkNode, isResizeNode, isCropNode, isRotateFlipNode, isInvertNode } from './types';
import type { AppNode, FileAsset } from './types';
import type { ExecutionGraph } from './executionGraph';
import { nodeProblem } from './executionGraph';
import { aborted, withAbort } from './workflowExecution';
import { assetResources } from './assetResources';
import { imageOutput, compositorInputs, blendInputs } from './sunburstRun';
import { resizeRevision, resizeSize, validResizeSize } from './resize';
import { cropRevision, cropPixels } from './crop';
import { rotateFlipRevision, rotateFlipTransform } from './rotateFlip';
import { invertRevision, invertPixels } from './invert';
import { blurRevision } from './blur';
import { colorRevision } from './colorCorrection';
import { levelsRevision } from './levels';
import { matteGrowShrinkRevision } from './matteGrowShrink';
import { blendRevision } from './blend';
import { painterRevision } from './painter';
import { masksRevision } from './masksExtractor';
import { compositorRevision } from './compositor';
import { paletteBands, paletteRevision, paletteSize } from './colorPalette';
import { BlurRenderer } from './blurRender';
import { ColorRenderer } from './colorCorrectionRender';
import { LevelsRenderer } from './levelsRender';
import { MatteGrowShrinkRenderer } from './matteGrowShrinkRender';
import { BlendRenderer } from './blendRender';
import { CompositorRenderer } from './compositor/renderer';
import { painterBlob, renderPainter } from './painterRender';
import { renderMasks } from './masksRender';

type Frame = { blob?: Blob; bitmap?: ImageBitmap; width?: number; height?: number };
export function requireFormalFrame(frame: Frame | undefined): asserts frame is Frame & { blob: Blob } {
  if (!frame?.blob || !frame.blob.size) throw new Error('正式输出未完成或已被替换，请重新运行。');
}
function canvas(width: number, height: number) {
  if (!validResizeSize({ width, height })) throw new Error('输出尺寸无效或超过 64 MP。');
  const element = document.createElement('canvas'); element.width = width; element.height = height;
  return element;
}
async function load(asset: FileAsset, signal: AbortSignal) {
  const image = new Image(); image.crossOrigin = 'anonymous'; image.src = asset.url;
  await withAbort(image.decode(), signal); aborted(signal);
  return image;
}
// Formal work uses a dedicated worker, never the preview's replaceable pending
// slot. Empty worker replies are terminal errors rather than successful outputs.
export async function renderExecutionOutput(node: AppNode, graph: ExecutionGraph, parent: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent.reason);
  parent.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort('本地图像处理超时。'), 120000);
  const signal = controller.signal;
  const assets: FileAsset[] = [];
  const asset = (blob: Blob, width: number, height: number): FileAsset => {
    aborted(parent); aborted(signal);
    const result: FileAsset = { id: crypto.randomUUID(), name: `${node.type}.png`, kind: 'image', url: assetResources.create(blob), size: blob.size, width, height };
    assets.push(result); return result;
  };
  const worker = async (engine: { dispose: () => void }, work: Promise<Frame | undefined>) => {
    const stop = () => engine.dispose(); signal.addEventListener('abort', stop, { once: true });
    try { const frame = await withAbort(work, signal); frame?.bitmap?.close(); requireFormalFrame(frame); return frame; }
    finally { signal.removeEventListener('abort', stop); engine.dispose(); }
  };
  try {
    aborted(parent);
    const inputEdge = graph.edges.find(edge => edge.target === node.id && edge.targetHandle === (isColorCorrectionNode(node) ? 'file' : 'image'));
    const input = inputEdge ? imageOutput(graph.nodes.find(item => item.id === inputEdge.source), inputEdge.sourceHandle, graph.nodes, graph.edges)[0] : 'baseImage' in node.data ? node.data.baseImage as FileAsset | undefined : undefined;
    if (isCompositorNode(node)) {
      const inputs = compositorInputs(node.id, graph.nodes, graph.edges);
      const engine = new CompositorRenderer(false);
      const frame = await worker(engine, engine.render(node.data.document, inputs).then(value => value && ({ ...value, width: value.layout.width, height: value.layout.height })));
      return { result: asset(frame.blob!, frame.width!, frame.height!), outputRevision: compositorRevision(node.data.document, inputs) };
    }
    if (isBlendNode(node)) {
      const inputs = blendInputs(node, graph.nodes, graph.edges);
      if (!inputs.back && !inputs.front) nodeProblem(node, '请连接图片。');
      const images = await Promise.all([inputs.back, inputs.front].map(async source => source ? createImageBitmap(await load(source, signal)) : undefined));
      aborted(signal);
      const engine = new BlendRenderer({ back: images[0], front: images[1] });
      const frame = await worker(engine, engine.render(node.data.settings, true));
      return { result: asset(frame.blob!, frame.width!, frame.height!), outputRevision: blendRevision(node.data.settings, inputs.back, inputs.front) };
    }
    if (isColorPaletteNode(node)) {
      if (!node.data.colors.length) nodeProblem(node, '请先选择颜色。');
      const image = canvas(paletteSize, paletteSize), context = image.getContext('2d')!;
      for (const band of paletteBands(node.data.colors)) { context.fillStyle = band.hex; context.fillRect(0, band.y, paletteSize, band.height); }
      return { result: asset(await painterBlob(image), paletteSize, paletteSize), outputRevision: paletteRevision(node.data.colors) };
    }
    if (!input && node.type !== 'painter') nodeProblem(node, '图片输入为空。');
    const image = input ? await load(input, signal) : undefined;
    const inputId = input?.id ?? '';
    if (isPainterNode(node)) {
      const rendered = renderPainter(node.data, image);
      const blobs = await Promise.all([rendered.result, rendered.mask, rendered.alphaMask].map(painterBlob));
      return { result: asset(blobs[0], rendered.width, rendered.height), mask: asset(blobs[1], rendered.width, rendered.height), alphaMask: asset(blobs[2], rendered.width, rendered.height), outputRevision: painterRevision(node.data, inputId) };
    }
    if (isMasksExtractorNode(node)) {
      const revision = masksRevision(node.data, inputId);
      if (!node.data.selection || !revision) nodeProblem(node, '请为当前图片重新完成选区。');
      const rendered = await renderMasks(image!, node.data.selection!);
      return { result: asset(rendered.resultBlob, rendered.width, rendered.height), mask: asset(rendered.maskBlob, rendered.width, rendered.height), outputRevision: revision };
    }
    if (isBlurNode(node) || isLevelsNode(node) || isColorCorrectionNode(node) || isMatteGrowShrinkNode(node)) {
      const source = await createImageBitmap(image!); aborted(signal);
      let frame: Frame, revision: string;
      if (isBlurNode(node)) { const engine = new BlurRenderer(source); frame = await worker(engine, engine.render(node.data.settings, true)); revision = blurRevision(node.data, inputId); }
      else if (isLevelsNode(node)) { const engine = new LevelsRenderer(source); frame = await worker(engine, engine.render(node.data.settings, true)); revision = levelsRevision(node.data, inputId); }
      else if (isColorCorrectionNode(node)) { const engine = new ColorRenderer(source); frame = await worker(engine, engine.render(node.data.settings, true)); revision = colorRevision(node.data, inputId); }
      else if (isMatteGrowShrinkNode(node)) { const engine = new MatteGrowShrinkRenderer(source); frame = await worker(engine, engine.render(node.data.settings, true)); revision = matteGrowShrinkRevision(node.data, inputId); }
      return { result: asset(frame!.blob!, image!.naturalWidth, image!.naturalHeight), outputRevision: revision! };
    }
    let output: HTMLCanvasElement, revision: string;
    const width = image!.naturalWidth, height = image!.naturalHeight;
    if (isResizeNode(node)) {
      const size = resizeSize(node.data.settings, { width, height }); output = canvas(size.width, size.height);
      const context = output.getContext('2d')!; context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(image!, 0, 0, size.width, size.height);
      revision = resizeRevision(node.data, inputId);
    } else if (isCropNode(node)) {
      const rect = cropPixels(node.data.rect, width, height); output = canvas(rect.width, rect.height);
      output.getContext('2d')!.drawImage(image!, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height); revision = cropRevision(node.data, inputId);
    } else if (isRotateFlipNode(node)) {
      const transform = rotateFlipTransform(width, height, node.data.settings); output = canvas(transform.width, transform.height);
      const context = output.getContext('2d')!; context.setTransform(...transform.matrix); context.drawImage(image!, 0, 0); revision = rotateFlipRevision(node.data, inputId);
    } else if (isInvertNode(node)) {
      output = canvas(width, height); const context = output.getContext('2d')!; context.drawImage(image!, 0, 0);
      const pixels = context.getImageData(0, 0, width, height); pixels.data.set(invertPixels(pixels.data)); context.putImageData(pixels, 0, 0); revision = invertRevision(inputId);
    } else nodeProblem(node, '此节点没有可执行的图片输出。');
    return { result: asset(await painterBlob(output!), output!.width, output!.height), outputRevision: revision! };
  } catch (error) { assetResources.discard(assets.map(asset => asset.url)); throw error; }
  finally { clearTimeout(timer); parent.removeEventListener('abort', cancel); }
}
