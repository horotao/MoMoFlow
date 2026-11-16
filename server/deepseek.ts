import { trusted } from './providerDiagnostics.ts';
import { providerConnection } from './apiCredentials.ts';
import { deepSeekFileIdPattern, describerMaxImages, describerMaxInstructions } from '../src/nodes/describer.ts';
import { isTimeoutStatus, modelTimeoutCode } from '../src/nodes/modelRequestError.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

function inlineImages(input: Record<string, unknown>) {
  if (input.model !== 'deepseek-flash') throw new Error('请选择 deepseek-flash；其他模型尚未接入。');
  if (!Array.isArray(input.images) || !input.images.length || input.images.length > describerMaxImages) throw new Error(`请提供 1–${describerMaxImages} 张图片。`);
  return input.images.map((url: unknown) => {
    if (typeof url !== 'string' || !/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) throw new Error('图片必须为 JPEG、PNG、GIF 或 WebP。');
    if (url.length > 44 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
    return { type: 'image_url', image_url: { url, detail: 'original' } };
  });
}

function uploadedFiles(input: Record<string, unknown>) {
  const fileIds = input.fileIds;
  if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > describerMaxImages
    || Object.keys(input).some(key => key !== 'fileIds' && key !== 'instructions')) throw new Error(`请只提交 1–${describerMaxImages} 个 DeepSeek 文件 ID 和系统指令。`);
  return fileIds.map((fileId: unknown) => {
    if (typeof fileId !== 'string' || !deepSeekFileIdPattern.test(fileId)) throw new Error('无效的 DeepSeek 文件 ID。');
    return { type: 'file', file_id: fileId };
  });
}

export function buildDeepSeekRequest(value: unknown, allowInlineImages = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求格式不正确。');
  const input = value as Record<string, unknown>;
  if (typeof input.instructions !== 'string' || input.instructions.length > describerMaxInstructions) throw new Error('系统指令过长或格式不正确。');
  const images = allowInlineImages && !('fileIds' in input) ? inlineImages(input) : uploadedFiles(input);
  return {
    model: 'deepseek-flash', stream: false, max_tokens: 2048, thinking: { type: 'disabled' },
    messages: [
      ...(input.instructions.trim() ? [{ role: 'system', content: input.instructions }] : []),
      { role: 'user', content: [
        { type: 'text', text: '请根据所提供的图片反推可用于图像生成的提示词。准确描述主体、构图、环境、光线、色彩、材质、风格和视角，不要编造不可见细节。多图请分别输出。遵循系统指令指定的语言和格式，默认用中文，仅输出提示词。' },
        ...images,
      ] },
    ],
  };
}

export function createDeepseekMiddleware(defaultApiKey: string, providerFetch: typeof fetch = fetch) {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/describer') return next();
    const send = (status: number, value: object) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); } };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (!trusted(req)) return send(403, { error: 'Host or Origin not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected application/json' });
    let connection;
    try { connection = providerConnection(req, 'deepseek', defaultApiKey, providerFetch); }
    catch { return send(400, { error: 'API 配置无效，请重新保存 DeepSeek 配置' }); }
    const { apiKey } = connection;
    if (!apiKey) return send(503, { error: '请在 .env.local 设置 DEEPSEEK_API_KEY，然后重启开发服务器。' });
    const allowInlineImages = Boolean(defaultApiKey) && req.headers['x-momoflow-api-key'] === undefined;
    const maxBody = allowInlineImages ? 47 * 1024 * 1024 : 128 * 1024;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBody) { send(413, { error: allowInlineImages ? '图片总大小过大，请压缩图片后重试。' : '请求过大，请只提交 DeepSeek 文件 ID 和系统指令。' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      let body: ReturnType<typeof buildDeepSeekRequest>;
      try { body = buildDeepSeekRequest(JSON.parse(Buffer.concat(chunks).toString()), allowInlineImages); }
      catch (error) { send(400, { error: error instanceof Error ? error.message : '请求格式错误。' }); return; }
      const response = await connection.fetch(`${connection.baseUrl}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, redirect: 'error',
      });
      if (!response.ok) {
        const messages: Record<number, string> = { 401: 'DeepSeek API Key 无效。', 402: 'DeepSeek 余额不足。', 429: 'DeepSeek 请求过于频繁，请稍后手动重试。', 400: 'DeepSeek 拒绝了图片或参数，请检查图片格式与尺寸。' };
        send(502, { error: messages[response.status] ?? `DeepSeek 请求失败（${response.status}）。`, ...(isTimeoutStatus(response.status) ? { code: modelTimeoutCode } : {}) }); return;
      }
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim() || result.choices[0].finish_reason === 'length') { send(502, { error: 'DeepSeek 未返回完整提示词，请手动重试。' }); return; }
      send(200, { text, usage: result.usage });
    } catch { send(502, { error: controller.signal.aborted ? '请求超时或已取消；不会自动重试。' : '无法连接 DeepSeek，请检查网络。', ...(controller.signal.aborted ? { code: modelTimeoutCode } : {}) }); }
    finally { clearTimeout(timer); res.off('close', close); }
  };
  return middleware;
}

export function deepseekPlugin(...args: Parameters<typeof createDeepseekMiddleware>): Plugin {
  const middleware = createDeepseekMiddleware(...args);
  return { name: 'deepseek-describer', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
