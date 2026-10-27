import type { IncomingMessage, ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { Plugin } from 'vite';
import { ideogramEditModel, ideogramModel, validateIdeogramEditSettings, validateIdeogramPrompt, validateIdeogramSettings } from '../src/nodes/ideogram.ts';
import { trusted } from './zenmuxShared.ts';

class WaveSpeedError extends Error {}

const apiBase = 'https://api.wavespeed.ai/api/v3';
const terminalFailures = new Set(['failed', 'cancelled', 'timeout', 'deleted']);
type Pause = (milliseconds: number, signal: AbortSignal) => Promise<void>;
const pause: Pause = (milliseconds, signal) => delay(milliseconds, undefined, { signal });
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function buildIdeogramRequest(value: unknown) {
  const settings = validateIdeogramSettings(value);
  return {
    prompt: validateIdeogramPrompt(record(value).prompt),
    resolution: settings.resolution, aspect_ratio: settings.aspectRatio,
    quality: settings.quality, enable_prompt_expansion: settings.enablePromptExpansion,
  };
}

function imageBytes(value: unknown, mask = false) {
  const match = typeof value === 'string' ? value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/) : null;
  if (!match || match[2].length % 4 || (mask && match[1] !== 'image/png')) throw new Error('编辑图片必须是 PNG、JPEG 或 WebP 数据，转换后的 Mask 必须为 PNG。');
  const size = Buffer.byteLength(match[2], 'base64');
  if (size > 32 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
  return { size, type: match[1], base64: match[2] };
}

export function buildIdeogramEditRequest(value: unknown) {
  const input = record(value), masked = input.mask !== undefined;
  const settings = validateIdeogramEditSettings(input, masked);
  const prompt = validateIdeogramPrompt(input.prompt);
  const image = imageBytes(input.image);
  if (!Array.isArray(input.referenceImages) || input.referenceImages.length > (masked ? 3 : 4)) throw new Error('参考图最多 4 张，使用 Mask 时最多 3 张。');
  const references = input.referenceImages.map(item => imageBytes(item));
  const mask = masked ? imageBytes(input.mask, true) : undefined;
  if (image.size + references.reduce((sum, item) => sum + item.size, 0) + (mask?.size ?? 0) > 46 * 1024 * 1024) throw new Error('输入图片总大小不能超过 46 MiB。');
  return {
    prompt, image: input.image as string, reference_images: input.referenceImages as string[],
    edit_precision: settings.editPrecision, quality: settings.editQuality,
    ...(masked ? { mask_url: input.mask as string } : {}),
    ...(settings.editSize !== 'auto' ? { size: settings.editSize } : {}),
  };
}

function uploadUrl(value: unknown): string {
  let url: URL;
  try { url = new URL(typeof value === 'string' ? value : ''); }
  catch { throw new WaveSpeedError('WaveSpeed 返回了无效上传地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new WaveSpeedError('WaveSpeed 返回了无效上传地址。');
  return url.href;
}

export async function uploadIdeogramImages(apiKey: string, input: ReturnType<typeof buildIdeogramEditRequest>, signal: AbortSignal, providerFetch: typeof fetch = fetch) {
  const upload = async (data: string, filename: string) => {
    signal.throwIfAborted();
    const image = imageBytes(data);
    const ticketResponse = await providerFetch(`${apiBase}/media/uploads`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: `${filename}.${image.type.slice(6)}`, size: image.size, content_type: image.type }),
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    if (!ticketResponse.ok) { await ticketResponse.body?.cancel(); throw httpError(ticketResponse.status); }
    const ticket = await readPrediction(ticketResponse), details = record(ticket.upload);
    if (details.method !== 'PUT') throw new WaveSpeedError('WaveSpeed 返回了无效上传方式。');
    const url = uploadUrl(details.url), download = uploadUrl(ticket.download_url);
    const headers = new Headers();
    for (const [name, value] of Object.entries(record(details.headers))) {
      if (typeof value !== 'string' || name.toLowerCase() === 'authorization' || value.includes(apiKey)) throw new WaveSpeedError('WaveSpeed 返回了无效上传请求头。');
      headers.set(name, value);
    }
    signal.throwIfAborted();
    // The signed ticket is used verbatim; the API key never accompanies the PUT.
    const response = await providerFetch(url, { method: 'PUT', headers, body: new Uint8Array(Buffer.from(image.base64, 'base64')), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
    await response.body?.cancel();
    if (!response.ok) throw new WaveSpeedError(`WaveSpeed 图片上传失败（HTTP ${response.status}），尚未提交生成任务。`);
    return download;
  };
  const image = await upload(input.image, 'source');
  const reference_images: string[] = [];
  for (const [index, reference] of input.reference_images.entries()) reference_images.push(await upload(reference, `reference-${index + 1}`));
  const mask_url = input.mask_url ? await upload(input.mask_url, 'mask') : undefined;
  return { ...input, image, reference_images, ...(mask_url ? { mask_url } : {}) };
}

async function readPrediction(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new WaveSpeedError('WaveSpeed 返回了空响应。');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024 * 1024) throw new WaveSpeedError('WaveSpeed 响应过大。');
      chunks.push(value);
    }
    let body: Record<string, unknown>;
    try { body = record(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { throw new WaveSpeedError('WaveSpeed 返回了无效响应。'); }
    if (typeof body.code === 'number' && body.code !== 200) throw new WaveSpeedError('WaveSpeed 未确认请求成功。');
    return 'data' in body ? record(body.data) : body;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function httpError(status: number) {
  const hint = status === 401 || status === 403 ? '请检查 WAVESPEED_API_KEY 及模型权限。' : status === 402 ? '请检查 WaveSpeed 余额。' : status === 429 ? '请求过于频繁。' : '';
  return new WaveSpeedError(`WaveSpeed HTTP ${status}。${hint}`);
}

export function pollingDelay(retryAfter: string | null, failures: number, now = Date.now()) {
  const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - now : NaN;
  return Math.min(300000, Math.max(2000, Number.isFinite(requested) ? requested : Math.min(30000, 2000 * 2 ** Math.min(failures - 1, 4))));
}

export async function runIdeogramPrediction(apiKey: string, input: ReturnType<typeof buildIdeogramRequest> | ReturnType<typeof buildIdeogramEditRequest>, signal: AbortSignal, providerFetch: typeof fetch = fetch, wait: Pause = pause, onTaskId: (id: string) => void = () => {}) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  signal.throwIfAborted();
  // A POST is sent exactly once: an ambiguous failure can still be a billed task.
  const submitted = await providerFetch(`${apiBase}/${'image' in input ? ideogramEditModel : ideogramModel}`, {
    method: 'POST', headers, body: JSON.stringify(input), redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  if (!submitted.ok) { await submitted.body?.cancel(); throw httpError(submitted.status); }
  let prediction = await readPrediction(submitted);
  const taskId = prediction.id;
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) throw new WaveSpeedError('WaveSpeed 未返回有效 Task ID。');
  onTaskId(taskId);
  let failures = 0, waitMs = 2000;
  for (;;) {
    signal.throwIfAborted();
    if (prediction.status === 'completed') {
      const outputs = prediction.outputs;
      if (!Array.isArray(outputs) || !outputs.length || outputs.length > 4) throw new WaveSpeedError('WaveSpeed 未返回图片。');
      const urls = outputs.map(item => {
        let url: URL;
        try { url = new URL(typeof item === 'string' ? item : ''); }
        catch { throw new WaveSpeedError('WaveSpeed 返回了无效图片地址。'); }
        if (url.protocol !== 'https:' || url.username || url.password) throw new WaveSpeedError('WaveSpeed 返回了无效图片地址。');
        return url.href;
      });
      return { taskId, outputs: urls };
    }
    if (terminalFailures.has(String(prediction.status))) throw new WaveSpeedError(`WaveSpeed 任务结束：${prediction.status}。`);
    await wait(waitMs, signal);
    signal.throwIfAborted();
    let response: Response | undefined;
    try {
      response = await providerFetch(`${apiBase}/predictions/${encodeURIComponent(taskId)}/result`, {
        headers, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      });
      if (response.ok) {
        prediction = await readPrediction(response);
        if (prediction.id !== taskId) throw new WaveSpeedError('WaveSpeed 返回的 Task ID 不匹配。');
        failures = 0; waitMs = 2000;
        continue;
      }
    } catch (error) {
      signal.throwIfAborted();
      // Invalid JSON/schema is not a transient transport failure.
      if (response && !(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'TypeError'))) throw error;
    }
    if (response && !response.ok && response.status !== 429 && response.status < 500) {
      await response.body?.cancel(); throw httpError(response.status);
    }
    failures++;
    waitMs = pollingDelay(response?.headers.get('retry-after') ?? null, failures);
    await response?.body?.cancel().catch(() => {});
  }
}

export function ideogramPlugin(apiKey: string, providerFetch: typeof fetch = fetch, wait: Pause = pause): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0];
    if (path !== '/api/ideogram' && path !== '/api/ideogram/edit') return next();
    const editing = path === '/api/ideogram/edit';
    const send = (status: number, value: object) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (!trusted(req)) return send(403, { error: 'Host or Origin not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected application/json' });
    if (!apiKey) return send(503, { error: '请在 .env.local 配置 WAVESPEED_API_KEY，然后重启开发服务器。' });
    const controller = new AbortController(); let taskId = '', submitted = false;
    const timeout = setTimeout(() => controller.abort(), 300000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > (editing ? 64 * 1024 * 1024 : 128 * 1024)) return send(413, { error: '请求过大。' });
        chunks.push(Buffer.from(chunk));
      }
      let input: ReturnType<typeof buildIdeogramRequest> | ReturnType<typeof buildIdeogramEditRequest>;
      try { input = (editing ? buildIdeogramEditRequest : buildIdeogramRequest)(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { return send(400, { error: error instanceof SyntaxError ? '请求格式错误。' : error instanceof Error ? error.message : '输入参数无效。' }); }
      if ('image' in input) input = await uploadIdeogramImages(apiKey, input, controller.signal, providerFetch);
      controller.signal.throwIfAborted();
      submitted = true;
      const result = await runIdeogramPrediction(apiKey, input, controller.signal, providerFetch, wait, id => { taskId = id; });
      send(200, result);
    } catch (error) {
      // Only locally constructed messages may reach the browser, never upstream bodies or fetch errors.
      const message = error instanceof WaveSpeedError ? error.message : '无法取得 WaveSpeed 结果。';
      send(502, { error: `${controller.signal.aborted ? '请求超时或已取消。' : message} ${submitted ? '已提交请求仍可能计费，不会自动重试；请先到 WaveSpeed History 查看。' : '尚未提交生成任务。'}${taskId ? ` Task ID：${taskId}` : ''}`, ...(taskId ? { taskId } : {}) });
    } finally { clearTimeout(timeout); res.off('close', close); }
  };
  return { name: 'wavespeed-ideogram', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
