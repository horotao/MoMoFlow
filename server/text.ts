import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { providerConnection } from './apiCredentials.ts';
import { diagnosticText, readErrorDiagnostic, trusted } from './providerDiagnostics.ts';
import { isTextModel, isTextReasoningEffort } from '../src/nodes/textGeneration.ts';
import { readSse } from '../src/nodes/responseStream.ts';
import { textBilling } from '../src/nodes/textPricing.ts';
import { textCitations } from '../src/nodes/textCitations.ts';

export function buildTextRequest(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('请求格式无效。');
  const input = value as Record<string, unknown>;
  if (!isTextModel(input.model)) throw new Error('请选择受支持的 OpenAI 文本模型。');
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 128000) throw new Error('提示词不能为空，最多 128000 个字符。');
  if (!Array.isArray(input.images) || input.images.length > 16) throw new Error('最多接入 16 张图片。');
  const effort = input.reasoningEffort ?? 'low';
  if (!isTextReasoningEffort(effort)) throw new Error('请选择受支持的思考强度。');
  if (input.webSearch !== undefined && typeof input.webSearch !== 'boolean') throw new Error('网络搜索设置无效。');
  const images = input.images.map(image => {
    if (typeof image !== 'string' || image.length > 44 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('参考图需为 PNG、JPEG 或 WebP 图片。');
    return { type: 'input_image' as const, image_url: image, detail: 'auto' as const };
  });
  return { model: input.model, input: [{ role: 'user' as const, content: [{ type: 'input_text' as const, text: input.prompt }, ...images] }],
    reasoning: { effort }, ...(input.webSearch ? { tools: [{ type: 'web_search' as const }] } : {}),
    stream: true, store: false, max_output_tokens: 16384 };
}
function responseContent(value: unknown) {
  const result = value as { output?: { type?: string; content?: { type?: string; text?: string; annotations?: {
    type?: string; url?: string; title?: string; start_index?: number; end_index?: number;
  }[] }[] }[] } | undefined;
  let text = '';
  const annotations = [];
  for (const part of (result?.output ?? []).filter(item => item.type === 'message').flatMap(item => item.content ?? [])) {
    if (part.type !== 'output_text' || typeof part.text !== 'string') continue;
    for (const annotation of part.annotations ?? []) {
      if (annotation.type === 'url_citation') annotations.push({ url: annotation.url, title: annotation.title ?? annotation.url,
        startIndex: (annotation.start_index ?? NaN) + text.length, endIndex: (annotation.end_index ?? NaN) + text.length });
    }
    text += part.text;
  }
  return { text, citations: textCitations(annotations, text) };
}
export function createTextMiddleware(openaiKey: string, providerFetch: typeof fetch = fetch) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/text') return next();
    const send = (status: number, error: string) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error }));
    };
    if (req.method !== 'POST') return send(405, 'Method not allowed');
    if (!trusted(req)) return send(403, 'Host or Origin not allowed');
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, 'Expected application/json');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    let apiKey = ''; let streaming = false;
    const event = (value: object) => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(value)}\n\n`); };
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 64 * 1024 * 1024) return send(413, '参考图片总大小过大。');
        chunks.push(Buffer.from(chunk));
      }
      let payload: ReturnType<typeof buildTextRequest>;
      try { payload = buildTextRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { return send(400, error instanceof Error ? error.message : '请求格式错误。'); }
      let connection;
      try { connection = providerConnection(req, 'openai', openaiKey, providerFetch); }
      catch { return send(400, 'OpenAI 配置无效，请重新保存 API 设置。'); }
      apiKey = connection.apiKey;
      if (!apiKey) return send(503, '请在 API 设置填写 OpenAI Key，或配置 OPENAI_API_KEY 后重启开发服务器。');
      const upstream = await connection.fetch(`${connection.baseUrl}/responses`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(payload), signal: controller.signal, redirect: 'error',
      });
      if (!upstream.ok) {
        const diagnostic = await readErrorDiagnostic(upstream, apiKey);
        const messages: Record<number, string> = { 401: 'OpenAI Key 无效。', 403: '当前 Key 无权访问此模型。', 429: 'OpenAI 配额不足或请求受限。' };
        return send(upstream.status, [messages[upstream.status] ?? `OpenAI 请求失败（${upstream.status}）。`, diagnostic.message].filter(Boolean).join('\n'));
      }
      if (!upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) return send(502, 'OpenAI 未返回有效的流式响应。');
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
      res.flushHeaders?.(); streaming = true;
      let text = '';
      for await (const item of readSse(upstream.body, controller.signal)) {
        if (item.type === 'response.output_text.delta' && typeof item.delta === 'string') {
          text += item.delta;
          if (text.length > 2 * 1024 * 1024) throw new Error('结果过长，已停止读取。');
          event({ type: 'delta', delta: item.delta });
        } else if (item.type === 'response.completed') {
          const response = item.response as { id?: unknown; status?: unknown; model?: unknown } | undefined;
          const content = responseContent(response);
          const result = content.text || text;
          if (!response || response.status !== 'completed' || typeof response.id !== 'string' || !result.trim()) throw new Error('OpenAI 未返回完整文本，原有结果已保留。');
          if (typeof response.model === 'string' && !response.model.startsWith(payload.model)) throw new Error('返回模型与所选模型不符，未保存结果。');
          event({ type: 'completed', text: result, responseId: response.id, model: payload.model, reasoningEffort: payload.reasoning.effort,
            webSearch: Boolean(payload.tools?.length), citations: content.citations,
            ...textBilling(payload.model, response, Boolean(payload.tools?.length), connection.baseUrl) });
          res.end(); return;
        } else if (['error', 'response.failed', 'response.incomplete', 'response.refusal.done'].includes(String(item.type))) {
          const response = item.response as { error?: { message?: unknown }; incomplete_details?: { reason?: unknown } } | undefined;
          throw new Error(diagnosticText(item.message ?? item.refusal ?? response?.error?.message ?? response?.incomplete_details?.reason, apiKey) ?? 'OpenAI 未完成生成，请检查输入与用量后手动重试。');
        }
      }
      throw new Error('生成连接中断，未收到完成确认。');
    } catch (error) {
      const message = controller.signal.aborted ? '生成超时或已取消；已提交请求仍可能计费，不会自动重试。'
        : diagnosticText(error instanceof Error ? error.message : undefined, apiKey) ?? '无法取得 OpenAI 文本结果。';
      if (streaming) { event({ type: 'error', message }); if (!res.destroyed) res.end(); }
      else send(502, message);
    } finally { clearTimeout(timeout); res.off('close', close); }
  };
}
export function textPlugin(...args: Parameters<typeof createTextMiddleware>): Plugin {
  const middleware = createTextMiddleware(...args);
  return { name: 'openai-text', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
