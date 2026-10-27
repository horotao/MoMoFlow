import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';
import { nanoBananaMaxImages, nanoBananaModel, validateNanoBananaSettings } from '../src/nodes/nanoBanana.ts';
import { diagnosticText, errorDiagnostic, logIdentifier, readErrorDiagnostic, trusted, type ProviderDiagnostic } from './zenmuxShared.ts';

const maxBody = 64 * 1024 * 1024;
const endpoint = `https://zenmux.ai/api/vertex-ai/v1/publishers/${nanoBananaModel.replace('/', '/models/')}:generateContent`;

export function buildNanoBananaRequest(value: unknown) {
  const settings = validateNanoBananaSettings(value);
  const input = value as Record<string, unknown>;
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32000) throw new Error('请连接非空提示词，最多 32000 个字符。');
  if (!Array.isArray(input.images) || input.images.length > nanoBananaMaxImages) throw new Error(`最多支持 ${nanoBananaMaxImages} 张参考图片。`);
  let total = 0;
  const images = input.images.map((value: unknown) => {
    const match = typeof value === 'string' ? value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/) : null;
    if (!match || match[2].length % 4 !== 0) throw new Error('参考图片需为有效的 PNG、JPEG 或 WebP 数据。');
    const size = Buffer.byteLength(match[2], 'base64'); total += size;
    if (size > 20 * 1024 * 1024) throw new Error('单张参考图片不能超过 20 MiB。');
    if (total > 46 * 1024 * 1024) throw new Error('参考图片总大小不能超过 46 MiB。');
    return { inlineData: { mimeType: match[1], data: match[2] } };
  });
  // Gemini uses generateContent (including image editing), not Imagen :predict.
  // Auto deliberately omits aspectRatio so the model can follow the reference.
  return {
    contents: [{ role: 'user', parts: [{ text: input.prompt }, ...images] }],
    generationConfig: {
      candidateCount: 1, responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        ...(settings.aspectRatio === 'auto' ? {} : { aspectRatio: settings.aspectRatio }),
        // This model route rejects outputMimeType; encode the chosen format locally.
        imageSize: settings.imageSize,
      },
    },
  };
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
export function parseNanoBananaResult(value: unknown) {
  const result = record(value);
  if (record(result.promptFeedback).blockReason) throw new Error('提示词被模型拦截，请调整后手动重试。');
  const candidate = record(Array.isArray(result.candidates) ? result.candidates[0] : undefined);
  if (candidate.finishReason && candidate.finishReason !== 'STOP') throw new Error('模型未完整生成图片，结果未确认，请检查用量后再手动重试。');
  const parts = record(candidate.content).parts;
  let total = 0;
  const images = (Array.isArray(parts) ? parts : []).flatMap((value: unknown) => {
    const part = record(value);
    // Reasoning images are not final outputs. Text-only replies are not success.
    if (part.thought === true || !part.inlineData) return [];
    const data = record(part.inlineData);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(data.mimeType)) || typeof data.data !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.data) || data.data.length % 4 !== 0) throw new Error('ZenMux 返回了无效图片，结果未确认，请检查用量后再手动重试。');
    total += data.data.length;
    if (total > maxBody) throw new Error('ZenMux 图片结果过大，无法读取。');
    return [{ image: `data:${data.mimeType};base64,${data.data}`, format: String(data.mimeType).slice(6) }];
  });
  if (!images.length) throw new Error('ZenMux 未返回图片，结果未确认，请检查用量后再手动重试。');
  return { images };
}

async function readResult(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (length <= maxBody) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBody) throw new Error('Response too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function nanoBananaPlugin(apiKey: string, providerFetch: typeof fetch = fetch): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/nano-banana') return next();
    const send = (status: number, value: object) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (!trusted(req)) return send(403, { error: 'Host or Origin not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected application/json' });
    if (!apiKey) return send(503, { error: '请在 .env.local 配置 ZENMUX_API_KEY，然后重启开发服务器。' });
    const controller = new AbortController(), startedAt = Date.now(), localRequestId = randomUUID();
    let stage = 'read-request', diagnostic: ProviderDiagnostic | undefined;
    const failure = (message: string, error?: unknown) => {
      try {
        console.error('[zenmux-nano-banana]', JSON.stringify({
          timestamp: new Date().toISOString(), localRequestId, stage, model: nanoBananaModel,
          elapsedMs: Date.now() - startedAt, aborted: controller.signal.aborted, status: diagnostic?.status,
          requestId: logIdentifier(diagnostic?.requestId, apiKey), code: logIdentifier(diagnostic?.code, apiKey),
          type: logIdentifier(diagnostic?.type, apiKey), error: errorDiagnostic(error, apiKey),
        }));
      } catch { /* Diagnostics must not change request handling. */ }
      send(502, { error: [message, diagnostic && `ZenMux HTTP：${diagnostic.status}`,
        diagnostic?.message && `服务商说明：${diagnostic.message}`, diagnostic?.requestId && `Request ID：${diagnostic.requestId}`].filter(Boolean).join('\n'),
        ...(diagnostic ? { diagnostic } : {}),
      });
    };
    const timeout = setTimeout(() => controller.abort(), 300000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > maxBody) return send(413, { error: '图片总大小过大，请压缩后重试。' });
        chunks.push(Buffer.from(chunk));
      }
      let body: ReturnType<typeof buildNanoBananaRequest>;
      try { body = buildNanoBananaRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { return send(400, { error: error instanceof Error ? error.message : '请求格式错误。' }); }
      controller.signal.throwIfAborted();
      stage = 'request-provider';
      const response = await providerFetch(endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
      });
      const requestId = diagnosticText(response.headers.get('x-zenmux-requestid') ?? response.headers.get('x-request-id'), apiKey, 200);
      diagnostic = { status: response.status, ...(requestId ? { requestId } : {}) };
      if (!response.ok) {
        stage = 'read-provider-error';
        diagnostic = { ...diagnostic, ...await readErrorDiagnostic(response, apiKey), ...(requestId ? { requestId } : {}) };
        return failure(`ZenMux 请求失败（${response.status}），不会自动重试。`);
      }
      stage = 'read-result';
      const value = await readResult(response);
      stage = 'validate-result';
      let result: ReturnType<typeof parseNanoBananaResult>;
      try { result = parseNanoBananaResult(value); }
      catch (error) { return failure(error instanceof Error ? error.message : '未返回有效图片。'); }
      controller.signal.throwIfAborted();
      send(200, result);
    } catch (error) {
      failure(controller.signal.aborted ? '请求超时或已取消；已提交请求仍可能计费，不会自动重试。' : '无法取得 ZenMux 结果；请检查网络及用量后再手动重试。', error);
    } finally { clearTimeout(timeout); res.off('close', close); }
  };
  return { name: 'zenmux-nano-banana', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
