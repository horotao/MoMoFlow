import { grokImageModel, validateGrokImageRequest } from '../src/nodes/grokImage.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { providerConnection } from './apiCredentials.ts';
import { apimartInputUrl, apimartResultUrl } from '../src/nodes/apimartResult.ts';
import { diagnosticText, readErrorDiagnostic, trusted } from './providerDiagnostics.ts';
import { isTimeoutStatus, modelTimeoutCode } from '../src/nodes/modelRequestError.ts';
import { apimartExtMarkupError, imageFormats, sunburstModelForProvider, validateSunburstImageInputs, validateSunburstMarkup, validateSunburstSettings, validateSunburstVariant } from '../src/nodes/sunburst.ts';
import { parseReferenceImages } from './apimartReferences.ts';
import { buildNanoBananaRequest } from './nanoBanana.ts';
import { buildSeedreamRequest } from './seedream.ts';
import { klingImageMaxReferenceBytes, klingImageModel, validateKlingImageRequest } from '../src/nodes/klingImage.ts';

const maxBody = 64 * 1024 * 1024;
const taskIdPattern = /^[a-zA-Z0-9_-]{1,200}$/;
type InputImage = string | { blob: Blob; filename: string };
type GenerationRequest = { images: InputImage[]; markup?: InputImage; body: Record<string, unknown> };

export function buildApimartRequest(value: unknown): GenerationRequest {
  if (!value || typeof value !== 'object') throw new Error('图片参数格式错误。');
  const input = value as Record<string, unknown>;
  if (input.provider !== 'apimart') throw new Error('请选择 APIMart 渠道。');
  const settings = validateSunburstSettings(input);
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32000) throw new Error('请连接非空 Prompt，最多 32000 个字符。');
  if (!Array.isArray(input.images) || input.images.length > 16) throw new Error('最多支持 16 张参考图片。');
  const standard = settings.channelModel === 'gpt-image-2.6';
  validateSunburstImageInputs(settings.outputFormat, input.images.length > 0, Boolean(input.mask), 'apimart', settings.channelModel);
  if (['width', 'height', 'markup_url'].some(field => input[field] !== undefined)) throw new Error('APIMart 请求包含未支持的字段。');
  let markup: InputImage | undefined;
  if (input.markup !== undefined) {
    if (!standard) throw new Error(apimartExtMarkupError);
    validateSunburstMarkup(settings.outputFormat, input.images.length > 0, Boolean(input.mask));
    if (typeof input.markup === 'string' && !input.markup.startsWith('data:')) {
      markup = apimartInputUrl(input.markup);
    } else {
      if (typeof input.markup !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.markup)) throw new Error('标注图必须为 PNG 图片。');
      const bytes = Buffer.from(input.markup.slice(input.markup.indexOf(',') + 1), 'base64');
      if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error('APIMart 上传标注图须非空且不超过 30 MiB。');
      markup = { blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }), filename: 'markup.png' };
    }
  }
  const images: InputImage[] = input.images.map((url, index) => {
    if (typeof url === 'string' && !url.startsWith('data:')) return apimartInputUrl(url);
    if (typeof url !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) throw new Error('APIMart 参考图片需为 PNG、JPEG、WebP 或 GIF。');
    const mime = url.slice(5, url.indexOf(';'));
    if (!standard && mime === 'image/gif' && settings.resolution !== '1K') throw new Error('APIMart 2K / 4K 参考图不支持 GIF，请使用 PNG、JPEG 或 WebP。');
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (bytes.length > 20 * 1024 * 1024) throw new Error('APIMart 单张参考图片不能超过 20 MiB。');
    return { blob: new Blob([new Uint8Array(bytes)], { type: mime }), filename: `reference-${index + 1}.${mime.slice(6)}` };
  });
  let mask: string | undefined;
  if (input.mask !== undefined) {
    if (typeof input.mask === 'string' && !input.mask.startsWith('data:')) {
      if (!images.length) throw new Error('使用 Mask 时必须连接 Image。');
      mask = apimartInputUrl(input.mask);
    } else {
      if (typeof input.mask !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.mask)) throw new Error('Mask 必须为 PNG 图片。');
      if (!images.length) throw new Error('使用 Mask 时必须连接 Image。');
      if (Buffer.from(input.mask.slice(input.mask.indexOf(',') + 1), 'base64').length > 32 * 1024 * 1024) throw new Error('Mask 不能超过 32 MiB。');
      mask = input.mask;
    }
  }
  const body: Record<string, unknown> = {
    model: sunburstModelForProvider('apimart', validateSunburstVariant(input.variant), settings.channelModel),
    ...(!standard ? { version: validateSunburstVariant(input.variant).toLowerCase() } : {}),
    prompt: input.prompt, size: settings.size,
    ...(!standard || (settings.outputFormat !== 'gif' && !settings.size.includes('x')) ? { resolution: settings.resolution!.toLowerCase() } : {}),
    quality: settings.quality, output_format: settings.outputFormat, n: 1, nsfw_check: false,
    ...(settings.complexity !== 'auto' ? { complexity: settings.complexity } : {}),
    ...(standard ? { background: settings.background, moderation: settings.moderation } : {}),
    ...(mask ? { mask_url: mask } : {}),
    ...(standard && settings.outputFormat === 'gif' ? { frame_count: settings.frameCount } : {}),
    ...(standard && settings.outputFormat === 'svg' ? { svg: { model: settings.svgModel,
      ...(settings.svgEffort !== 'auto' ? { reasoning: { effort: settings.svgEffort } } : {}),
    } } : {}),
  };
  return { images, markup, body };
}

function buildKlingImageRequest(input: Record<string, unknown>): GenerationRequest {
  const { size, resolution, mode, prompt, count, images: sources } = validateKlingImageRequest(input);
  const images: InputImage[] = sources.map((source, index) => {
    if (!source.startsWith('data:')) return apimartInputUrl(source);
    const match = /^data:(image\/(png|jpeg|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
    if (!match || match[3].length % 4 !== 0) throw new Error('Kling V4 Image 参考图需为 PNG、JPEG 或 GIF。');
    const bytes = Buffer.from(match[3], 'base64');
    if (!bytes.length || bytes.length > klingImageMaxReferenceBytes) throw new Error('Kling V4 Image 参考图须非空且不超过 30 MiB。');
    return { blob: new Blob([new Uint8Array(bytes)], { type: match[1] }), filename: `reference-${index + 1}.${match[2]}` };
  });
  const quantity = mode === 'series'
    ? { sequential_image_generation: 'auto', sequential_image_generation_options: { max_images: count } }
    : { n: count };
  return { images, body: { model: klingImageModel, prompt, size, resolution, ...quantity } };
}

async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('APIMart 未返回有效内容。');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('APIMart 返回内容过大。');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createApimartMiddleware(defaultKey: string, providerFetch: typeof fetch = fetch) {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0];
    if (path !== '/api/apimart/images' && path !== '/api/apimart/seedream' && path !== '/api/apimart/grok' && path !== '/api/apimart/kling' && path !== '/api/apimart/task' && path !== '/api/nano-banana') return next();
    const send = (status: number, value: object) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (!trusted(req)) return send(403, { error: 'Host or Origin not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected application/json' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    let apiKey = ''; let taskId: string | undefined;
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > (path === '/api/apimart/task' ? 4096 : maxBody)) return send(413, { error: '图片总大小过大，请压缩后重试。' });
        chunks.push(Buffer.from(chunk));
      }
      let input: Record<string, unknown>;
      let generation: GenerationRequest | undefined;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString());
        if (path === '/api/apimart/images') generation = buildApimartRequest(input);
        else if (path === '/api/apimart/seedream') generation = buildSeedreamRequest(input);
        else if (path === '/api/apimart/grok') {
          const { prompt, size, images } = validateGrokImageRequest(input);
          generation = { images: parseReferenceImages(images), body: { model: grokImageModel, prompt, size, n: 1,
            response_format: 'url', ...(!images.length ? { resolution: 'quality' } : {}) } };
        } else if (path === '/api/apimart/kling') generation = buildKlingImageRequest(input);
        else if (path === '/api/nano-banana') generation = buildNanoBananaRequest(input);
        else {
          if (!input || typeof input.taskId !== 'string' || !taskIdPattern.test(input.taskId)) throw new Error('无效的 APIMart 任务编号。');
          if (!imageFormats.some(format => format === input.outputFormat)) throw new Error('不支持的 APIMart 输出格式。');
          taskId = input.taskId;
        }
      } catch (error) { return send(400, { error: error instanceof Error ? error.message : '请求格式错误。' }); }
      let connection;
      try { connection = providerConnection(req, 'apimart', defaultKey, providerFetch); }
      catch { return send(400, { error: 'API 配置无效，请重新保存 APIMart 配置。' }); }
      apiKey = connection.apiKey;
      if (!apiKey) return send(503, { error: '请在 API 设置中保存 APIMart Key，或配置 APIMART_API_KEY 后重启开发服务器。' });
      const call = async (suffix: string, body?: object | FormData) => {
        const form = body instanceof FormData;
        const response = await connection.fetch(`${connection.baseUrl}${suffix}`, {
          method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${apiKey}`, ...(path === '/api/apimart/grok' && suffix === '/images/generations'
            ? { 'X-APIMart-Response-Version': '2026-07-27', 'Idempotency-Key': crypto.randomUUID() } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: form ? body : JSON.stringify(body) } : {}), signal: controller.signal, redirect: 'error',
        });
        if (!response.ok) {
          const diagnostic = { status: response.status, ...await readErrorDiagnostic(response, apiKey) };
          send(502, { error: `APIMart 请求失败（HTTP ${response.status}），不会自动重新提交。${diagnostic.message ? `\n${diagnostic.message}` : ''}`, diagnostic,
            ...(isTimeoutStatus(response.status) ? { code: modelTimeoutCode } : {}), ...(taskId ? { taskId } : {}) });
          return;
        }
        return JSON.parse((await readLimited(response, 2 * 1024 * 1024)).toString()) as Record<string, unknown>;
      };
      if (generation) {
        const upload = async (image: InputImage) => {
          if (typeof image === 'string') return image;
          const form = new FormData(); form.append('file', image.blob, image.filename);
          const uploaded = await call('/uploads/images?retention_days=3', form);
          return uploaded ? apimartInputUrl(uploaded.url) : undefined;
        };
        const imageUrls: string[] = [];
        // Preserve reference order so markup always aligns with the first image.
        for (const image of generation.images) {
          const url = await upload(image);
          if (!url) return;
          imageUrls.push(url);
        }
        const markupUrl = generation.markup ? await upload(generation.markup) : undefined;
        if (generation.markup && !markupUrl) return;
        const result = await call('/images/generations', { ...generation.body, ...(imageUrls.length ? { image_urls: imageUrls } : {}),
          ...(markupUrl ? { markup_url: markupUrl } : {}),
        });
        if (!result) return;
        const data = result.data;
        const id = Array.isArray(data) ? data[0]?.task_id : (data as { id?: unknown } | null)?.id;
        if (typeof id !== 'string' || !taskIdPattern.test(id)) throw new Error('APIMart 未返回有效任务编号；结果未知，请检查请求记录后再手动重试。');
        return send(200, { taskId: id });
      }
      // The status API localizes failed task error.message with this query.
      const result = await call(`/tasks/${taskId}?language=zh`);
      if (!result) return;
      const task = (result.data ?? result) as { status?: string; error?: { message?: unknown }; result?: { images?: { url?: unknown; expires_at?: unknown }[] } };
      if (['submitted', 'pending', 'processing', 'cancelled'].includes(task.status ?? '')) return send(200, { status: task.status, taskId });
      if (task.status === 'failed') return send(502, { error: `APIMart 任务失败：${diagnosticText(task.error?.message, apiKey) ?? '请检查请求记录。'}`, taskId });
      if (task.status !== 'completed') throw new Error('APIMart 返回了未知任务状态。');
      if (input.allImages === true) {
        const imageUrls = task.result?.images?.flatMap(({ url }) => Array.isArray(url) ? url.map(apimartResultUrl) : [apimartResultUrl(url)]);
        if (!imageUrls?.length) throw new Error('APIMart 未返回图片结果。');
        return send(200, { status: 'completed', taskId, imageUrls, format: input.outputFormat });
      }
      const urls = task.result?.images?.[0]?.url;
      const url = Array.isArray(urls) ? urls[0] : urls;
      const imageUrl = apimartResultUrl(url);
      const expiresAt = task.result?.images?.[0]?.expires_at;
      send(200, { status: 'completed', taskId, imageUrl, format: input.outputFormat,
        ...(typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? { expiresAt } : {}),
      });
    } catch (error) {
      send(502, { error: controller.signal.aborted ? 'APIMart 请求超时或已取消，不会自动重新提交。'
        : diagnosticText(error instanceof Error ? error.message : '无法取得 APIMart 结果。', apiKey),
        ...(controller.signal.aborted ? { code: modelTimeoutCode } : {}), ...(taskId ? { taskId } : {}) });
    } finally { clearTimeout(timeout); res.off('close', close); }
  };
  return middleware;
}

export function apimartPlugin(...args: Parameters<typeof createApimartMiddleware>): Plugin {
  const middleware = createApimartMiddleware(...args);
  return { name: 'apimart-images', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
