import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';
import { sunburstModel, validateSunburstSettings } from '../src/nodes/sunburst.ts';

const maxBody = 64 * 1024 * 1024;
type ProviderDiagnostic = {
  status: number;
  requestId?: string;
  type?: string;
  code?: string;
  message?: string;
};

// Only retain diagnostic fields, never the raw response or echoed image payloads.
function diagnosticText(value: unknown, apiKey: string, limit = 2000): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).split(apiKey).join('[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/data:[^\s"'<>]+/gi, '[image data redacted]')
    .replace(/[A-Za-z0-9+/=]{256,}/g, '[payload redacted]')
    .replace(/\p{Cc}/gu, ' ').trim();
  return text ? text.slice(0, limit) + (text.length > limit ? '… [truncated]' : '') : undefined;
}

// Log identifiers only: messages/stacks can echo prompts, images, URLs or headers.
function logIdentifier(value: unknown, apiKey: string): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value);
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(text)) return undefined;
  return diagnosticText(text, apiKey, 200);
}

type ErrorDiagnostic = { name?: string; code?: string; causes?: ErrorDiagnostic[] };
function errorDiagnostic(error: unknown, apiKey: string, depth = 0): ErrorDiagnostic | undefined {
  if (!error || typeof error !== 'object' || depth >= 3) return undefined;
  const value = error as { name?: unknown; code?: unknown; cause?: unknown; errors?: unknown };
  const nested = [value.cause, ...(Array.isArray(value.errors) ? value.errors.slice(0, 4) : [])];
  const causes = nested.map(cause => errorDiagnostic(cause, apiKey, depth + 1)).filter(cause => cause !== undefined);
  return {
    name: logIdentifier(value.name, apiKey), code: logIdentifier(value.code, apiKey),
    ...(causes.length ? { causes } : {}),
  };
}

async function readErrorDiagnostic(response: Response, apiKey: string): Promise<Partial<ProviderDiagnostic>> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length <= 64 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 64 * 1024) return { message: '服务商错误响应过长，未保留正文。' };
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let body;
    try { body = JSON.parse(text); }
    catch {
      // Do not surface gateway HTML or broken JSON as a model error message.
      return /^[\s]*[<{[]/.test(text) ? {} : { message: diagnosticText(text, apiKey) };
    }
    const error = body?.error;
    return {
      type: diagnosticText(error?.type, apiKey, 200),
      code: diagnosticText(error?.code, apiKey, 200),
      message: diagnosticText(typeof error === 'string' ? error : error?.message ?? body?.message, apiKey),
      requestId: diagnosticText(body?.request_id ?? body?.requestId ?? error?.request_id, apiKey, 200),
    };
  } catch { return {}; }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function imageData(value: unknown, mask = false): string {
  if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('输入图片需为 PNG、JPEG 或 WebP。');
  if (value.length > 44 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
  if (mask && !value.startsWith('data:image/png;')) throw new Error('蒙版必须为带透明通道的 PNG。');
  return value;
}

export function buildSunburstRequest(value: unknown) {
  const settings = validateSunburstSettings(value);
  const input = value as Record<string, unknown>;
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32000) throw new Error('请连接非空 Prompt，最多 32000 个字符。');
  if (!Array.isArray(input.images) || input.images.length > 16) throw new Error('最多支持 16 张参考图片。');
  const images = input.images.map(url => ({ image_url: imageData(url) }));
  if (input.mask && !images.length) throw new Error('使用 Mask 时必须连接 Image。');
  const mask = input.mask ? { image_url: imageData(input.mask, true) } : undefined;
  return {
    endpoint: images.length ? 'edits' : 'generations',
    body: {
      model: sunburstModel, prompt: input.prompt, n: 1,
      quality: settings.quality, background: settings.background, size: settings.size, output_format: settings.outputFormat,
      ...(images.length ? { images, ...(mask ? { mask } : {}) } : {}),
    },
  };
}

function imageUpload(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  const type = dataUrl.slice(5, dataUrl.indexOf(';'));
  const bytes = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  return { blob: new Blob([new Uint8Array(bytes)], { type }), extension: type.slice('image/'.length) };
}

// Local image inputs use the documented file-upload form, avoiding data-URL
// conversion in the provider's JSON edit adapter. Generation remains JSON.
export function buildSunburstPayload(request: ReturnType<typeof buildSunburstRequest>): { body: string | FormData; headers: Record<string, string> } {
  if (request.endpoint === 'generations') return { body: JSON.stringify(request.body), headers: { 'Content-Type': 'application/json' } };
  const form = new FormData();
  const { images, mask, ...settings } = request.body;
  for (const [name, value] of Object.entries(settings)) form.append(name, String(value));
  for (const [index, image] of (images ?? []).entries()) {
    const { blob, extension } = imageUpload(image.image_url);
    form.append('image[]', blob, `image-${index + 1}.${extension}`);
  }
  if (mask) form.append('mask', imageUpload(mask.image_url).blob, 'mask.png');
  // fetch supplies the multipart boundary; never set Content-Type manually.
  return { body: form, headers: {} };
}

function trusted(req: IncomingMessage) {
  const host = req.headers.host;
  const match = host?.match(/^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return false;
  const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
  return req.headers.origin === undefined || req.headers.origin === `${protocol}://${host}`;
}

export function sunburstPlugin(apiKey: string, providerFetch: typeof fetch = fetch): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/sunburst') return next();
    const send = (status: number, value: object) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (!trusted(req)) return send(403, { error: 'Host or Origin not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected application/json' });
    if (!apiKey) return send(503, { error: '请在 .env.local 配置 ZENMUX_API_KEY，然后重启开发服务器。' });
    const controller = new AbortController();
    const startedAt = Date.now();
    const localRequestId = randomUUID();
    let stage = 'read-request';
    let endpoint: string | undefined;
    let diagnostic: ProviderDiagnostic | undefined;
    const sendFailure = (message: string, error?: unknown) => {
      // Logging must never change request handling, even if a log sink fails.
      try {
        console.error('[zenmux-sunburst]', JSON.stringify({
          timestamp: new Date().toISOString(), localRequestId, stage, endpoint,
          elapsedMs: Date.now() - startedAt, aborted: controller.signal.aborted,
          status: diagnostic?.status,
          requestId: logIdentifier(diagnostic?.requestId, apiKey),
          type: logIdentifier(diagnostic?.type, apiKey),
          code: logIdentifier(diagnostic?.code, apiKey),
          error: errorDiagnostic(error, apiKey),
        }));
      } catch { /* Diagnostics are best effort. */ }
      send(502, {
        error: [message, diagnostic?.type && `错误类型：${diagnostic.type}`,
          diagnostic?.code && `错误代码：${diagnostic.code}`,
          diagnostic?.message && `服务商说明：${diagnostic.message}`,
          diagnostic && `ZenMux HTTP：${diagnostic.status}`,
          diagnostic?.requestId && `Request ID：${diagnostic.requestId}`].filter(Boolean).join('\n'),
        ...(diagnostic ? { diagnostic } : {}),
      });
    };
    const timeout = setTimeout(() => controller.abort(), 300000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxBody) return send(413, { error: '图片总大小过大，请压缩后重试。' });
        chunks.push(Buffer.from(chunk));
      }
      let request: ReturnType<typeof buildSunburstRequest>;
      try { request = buildSunburstRequest(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (error) { return send(400, { error: error instanceof Error ? error.message : '请求格式错误。' }); }
      endpoint = request.endpoint;
      stage = 'build-payload';
      const payload = buildSunburstPayload(request);
      stage = 'request-provider';
      const response = await providerFetch(`https://zenmux.ai/api/v1/images/${request.endpoint}`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, ...payload.headers },
        body: payload.body, signal: controller.signal,
      });
      const requestId = diagnosticText(response.headers.get('x-zenmux-requestid') ?? response.headers.get('x-request-id'), apiKey, 200);
      diagnostic = { status: response.status, ...(requestId ? { requestId } : {}) };
      if (!response.ok) {
        stage = 'read-provider-error';
        diagnostic = { ...diagnostic, ...await readErrorDiagnostic(response, apiKey), ...(requestId ? { requestId } : {}) };
        const messages: Record<number, string> = { 401: 'ZenMux API Key 无效。', 402: 'ZenMux 余额不足。', 403: 'ZenMux 拒绝访问此模型。', 429: 'ZenMux 请求过于频繁，请稍后手动重试。', 400: 'ZenMux 拒绝了图片或参数，请检查输入图片、蒙版及参数。' };
        return sendFailure(messages[response.status] ?? `ZenMux 请求失败（${response.status}），不会自动重试。`);
      }
      stage = 'read-result';
      const result = await response.json();
      stage = 'validate-result';
      const data = result.data?.[0];
      if (typeof data?.b64_json !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.b64_json) || data.b64_json.length > maxBody) return sendFailure('ZenMux 未返回有效图片，结果未知，请检查用量后再手动重试。');
      const format = ['png', 'jpeg', 'webp'].includes(result.output_format) ? result.output_format : request.body.output_format;
      stage = 'send-result';
      send(200, { image: `data:image/${format};base64,${data.b64_json}`, format });
    } catch (error) {
      sendFailure(controller.signal.aborted ? '请求超时或已取消；已提交请求仍可能计费，不会自动重试。' : '无法取得 ZenMux 结果；请检查网络及用量后再手动重试。', error);
    } finally { clearTimeout(timeout); res.off('close', close); }
  };
  return { name: 'zenmux-sunburst', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
