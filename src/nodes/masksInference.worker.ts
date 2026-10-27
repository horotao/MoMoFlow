import { AutoProcessor, SamModel, RawImage, Tensor, env, type SamProcessor } from '@huggingface/transformers';
import type { MaskWorkerRequest, MaskWorkerResponse, MaskProgress } from './masksInference';

const port = self as unknown as {
  onmessage: (event: MessageEvent<MaskWorkerRequest | { cancel: number }>) => void;
  postMessage: (message: MaskWorkerResponse, transfer?: Transferable[]) => void;
};
const modelId = 'Xenova/slimsam-77-uniform';
// Pin the model revision as well as the JS dependency so cached files never mix versions.
const revision = 'd827ef0';
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

type PreparedImage = { pixel_values: Tensor; original_sizes: [number, number][]; reshaped_input_sizes: [number, number][] };
type Embeddings = Awaited<ReturnType<SamModel['get_image_embeddings']>>;
let model: SamModel | undefined, processor: SamProcessor | undefined;
let cached: { key: string; width: number; height: number; original: [number, number][]; reshaped: [number, number][]; embeddings: Embeddings } | undefined;
let queue = Promise.resolve();
const cancelled = new Set<number>();
const pending = new Set<number>();

async function run(request: MaskWorkerRequest) {
  const { id, source, point } = request;
  const report = (progress: MaskProgress) => { if (!cancelled.has(id)) port.postMessage({ id, type: 'progress', progress }); };
  if (!model || !processor) {
    report({ stage: 'loading' });
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ features: { has(feature: string): boolean } } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    if (!adapter || !adapter.features.has('shader-f16')) throw new Error('此设备暂不支持图像分割。请使用支持 WebGPU 的新版 Chrome / Edge，并开启硬件加速。');
    if (cancelled.has(id)) return;
    const downloads = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (event: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (event.status === 'progress' && event.file?.endsWith('.onnx')) {
        downloads.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
        const loaded = [...downloads.values()].reduce((sum, file) => sum + file.loaded, 0);
        // FP16 encoder + decoder are approximately 20.75 MB; still show loading
        // after transfer completes while ONNX initializes the sessions.
        report({ stage: 'download', progress: Math.min(99, Math.round(loaded / 20_750_000 * 100)) });
      }
    };
    try {
      processor = await AutoProcessor.from_pretrained(modelId, { revision }) as SamProcessor;
      model = await SamModel.from_pretrained(modelId, { revision, dtype: 'fp16', device: 'webgpu', progress_callback }) as SamModel;
    } catch (error) {
      model = undefined; processor = undefined;
      throw new Error(`模型加载失败，请检查网络后重试。${error instanceof Error ? ` ${error.message}` : ''}`);
    }
  }
  if (cancelled.has(id)) return;
  const key = `${source.id}:${source.url}`;
  if (!cached || cached.key !== key || request.recalculate) {
    report({ stage: 'encoding' });
    if (cached) { Object.values(cached.embeddings).forEach(tensor => tensor.dispose()); cached = undefined; }
    let image = await RawImage.fromURL(source.url);
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    if (scale < 1) image = await image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    if (cancelled.has(id)) return;
    const prepared = await processor(image) as PreparedImage;
    try {
      const embeddings = await model.get_image_embeddings(prepared);
      cached = { key, width: image.width, height: image.height, original: prepared.original_sizes, reshaped: prepared.reshaped_input_sizes, embeddings };
    } finally { prepared.pixel_values.dispose(); }
  }
  if (cancelled.has(id)) return;
  report({ stage: 'segmenting' });
  const input_points = new Tensor('float32', [point.x * cached.reshaped[0][1], point.y * cached.reshaped[0][0]], [1, 1, 1, 2]);
  const input_labels = new Tensor('int64', [1n], [1, 1, 1]);
  let outputs: { pred_masks: Tensor; iou_scores: Tensor } | undefined;
  let masks: Tensor[] | undefined;
  try {
    outputs = await model({ ...cached.embeddings, input_points, input_labels }) as typeof outputs;
    if (!outputs || cancelled.has(id)) return;
    const scores = outputs.iou_scores.data;
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (Number(scores[i]) > Number(scores[best])) best = i;
    // Resizing and thresholding are independent for each candidate. Select the
    // same highest-scoring mask first, avoiding work and buffers for the other two.
    const chosen = outputs.pred_masks.slice(null, null, [best, best + 1]);
    try { masks = await processor.post_process_masks(chosen, cached.original, cached.reshaped) as Tensor[]; }
    finally { chosen.dispose(); }
    // post_process_masks is [image][point batch, candidate, height, width].
    const size = cached.width * cached.height, pixels = new Uint8Array(size);
    const data = masks[0].data;
    for (let i = 0; i < size; i++) pixels[i] = Number(Boolean(data[i]));
    if (!cancelled.has(id)) port.postMessage({ id, type: 'result', bitmap: { width: cached.width, height: cached.height, pixels } }, [pixels.buffer]);
  } finally {
    input_points.dispose(); input_labels.dispose();
    outputs?.pred_masks.dispose(); outputs?.iou_scores.dispose();
    masks?.forEach(mask => mask.dispose());
  }
}

port.onmessage = ({ data }) => {
  if ('cancel' in data) { if (pending.has(data.cancel)) cancelled.add(data.cancel); return; }
  pending.add(data.id);
  // A single bounded embedding cache and serialized GPU execution are shared by
  // all nodes. Each node cancels obsolete work before queuing another request.
  queue = queue.then(async () => {
    try { if (!cancelled.has(data.id)) await run(data); }
    catch (error) { if (!cancelled.has(data.id)) port.postMessage({ id: data.id, type: 'error', message: error instanceof Error ? error.message : '无法生成蒙版，请重试。' }); }
    finally { cancelled.delete(data.id); pending.delete(data.id); }
  });
};
