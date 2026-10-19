import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export function buildDeepSeekRequest(input: { model?: unknown; instructions?: unknown; images?: unknown }) {
  if (input.model !== 'deepseek-flash') throw new Error('请选择 deepseek-flash；其他模型尚未接入。');
  if (typeof input.instructions !== 'string' || input.instructions.length > 20000) throw new Error('系统指令过长或格式不正确。');
  if (!Array.isArray(input.images) || !input.images.length || input.images.length > 14) throw new Error('请提供 1–14 张图片。');
  for (const url of input.images) {
    if (typeof url !== 'string' || !/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) throw new Error('图片必须为 JPEG、PNG、GIF 或 WebP。');
    if (url.length > 44 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
  }
  return {
    model: 'deepseek-flash', stream: false, max_tokens: 2048, thinking: { type: 'disabled' },
    messages: [
      ...(input.instructions.trim() ? [{ role: 'system', content: input.instructions }] : []),
      { role: 'user', content: [
        { type: 'text', text: '请根据所提供的图片反推可用于图像生成的提示词。准确描述主体、构图、环境、光线、色彩、材质、风格和视角，不要编造不可见细节。多图请分别输出。遵循系统指令指定的语言和格式，默认用中文，仅输出提示词。' },
        ...input.images.map((url: string) => ({ type: 'image_url', image_url: { url, detail: 'original' } })),
      ] },
    ],
  };
}

// This local-only API runs before Vite's host check, so it must validate Host itself.
function isTrustedLocalRequest(req: IncomingMessage): boolean {
  const host = req.headers.host;
  const match = host?.match(/^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return false;
  const origin = req.headers.origin;
  // Non-browser local clients can omit Origin, but must still use a trusted Host.
  if (origin === undefined) return true;
  const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
  return origin === `${protocol}://${host}`;
}

export function deepseekPlugin(apiKey: string): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/describer') return next();
    const send = (status: number, value: object) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); } };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (!isTrustedLocalRequest(req)) return send(403, { error: 'Host or Origin not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected application/json' });
    if (!apiKey) return send(503, { error: '请在 .env.local 设置 DEEPSEEK_API_KEY，然后重启开发服务器。' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 47 * 1024 * 1024) { send(413, { error: '图片总大小过大，请压缩图片后重试。' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      let body: ReturnType<typeof buildDeepSeekRequest>;
      try { body = buildDeepSeekRequest(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (error) { send(400, { error: error instanceof Error ? error.message : '请求格式错误。' }); return; }
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
      });
      if (!response.ok) {
        const messages: Record<number, string> = { 401: 'DeepSeek API Key 无效。', 402: 'DeepSeek 余额不足。', 429: 'DeepSeek 请求过于频繁，请稍后手动重试。', 400: 'DeepSeek 拒绝了图片或参数，请检查图片格式与尺寸。' };
        send(502, { error: messages[response.status] ?? `DeepSeek 请求失败（${response.status}）。` }); return;
      }
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim() || result.choices[0].finish_reason === 'length') { send(502, { error: 'DeepSeek 未返回完整提示词，请手动重试。' }); return; }
      send(200, { text, usage: result.usage });
    } catch { send(502, { error: controller.signal.aborted ? '请求超时或已取消；不会自动重试。' : '无法连接 DeepSeek，请检查网络。' }); }
    finally { clearTimeout(timer); res.off('close', close); }
  };
  return { name: 'deepseek-describer', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
