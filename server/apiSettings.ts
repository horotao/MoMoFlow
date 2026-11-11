import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { apiProviders, validApiKey, validBaseUrl, type ApiProvider } from '../src/components/apiSettings.ts';
import { trusted } from './zenmuxShared.ts';
import { ApiConfigurationError, byokFetch } from './byokFetch.ts';

type ServerKeys = Record<ApiProvider, string>;

async function readConnectionResponse(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiConfigurationError('地址未返回有效 API 响应');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) throw new ApiConfigurationError('API 响应过大，请检查 Base URL');
      chunks.push(value);
    }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ApiConfigurationError('地址未返回有效 API 响应'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiConfigurationError('地址未返回有效 API 响应');
    return value as Record<string, unknown>;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function connectionTestPath(provider: ApiProvider): string {
  if (provider === 'wavespeed') return '/balance';
  // ZenMux's model catalog is public, including with an invalid key. An
  // authenticated read of a deliberately absent generation verifies the key
  // without creating or billing a generation.
  if (provider === 'zenmux') return '/management/generation?id=gen_momoflow_connection_test';
  return '/models';
}

export async function checkApiConnection(provider: ApiProvider, baseUrl: string, apiKey: string, signal: AbortSignal, providerFetch: typeof fetch) {
  const response = await providerFetch(`${baseUrl}${connectionTestPath(provider)}`, {
    method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, redirect: 'error', signal,
  });
  try {
    const status = response.status;
    if (status === 401 || status === 403) throw new ApiConfigurationError('API Key 无效或权限不足');
    if (status === 429 || status === 422) throw new ApiConfigurationError('请求过于频繁，请稍后重试');
    if ([408, 504, 524].includes(status)) throw new ApiConfigurationError('连接超时，请重试');
    if (status === 404 && provider !== 'zenmux') throw new ApiConfigurationError('API 地址不正确，请检查 Base URL');
    if (!response.ok && !(provider === 'zenmux' && status === 404)) throw new ApiConfigurationError(status === 402 ? '账户余额不足' : `连接失败（HTTP ${status}）`);
    const body = await readConnectionResponse(response);
    if (provider === 'zenmux' && status === 404 && body.success === false
      && typeof body.message === 'string' && /generation.*not found/i.test(body.message)) return;
    if (status === 404) throw new ApiConfigurationError('API 地址不正确，请检查 Base URL');
    if (body.error || body.success === false) throw new ApiConfigurationError('渠道商未确认连接成功');
    if (provider === 'wavespeed') {
      const data = body.data as { balance?: unknown } | undefined;
      if (body.code !== 200 || typeof data?.balance !== 'number' || !Number.isFinite(data.balance)) throw new ApiConfigurationError('地址未返回有效余额响应');
    } else if (provider === 'zenmux') {
      // A normal result is also accepted for compatible gateways implementing
      // the read endpoint, provided its authenticated result shape is present.
      if (body.success !== true || !body.data || typeof body.data !== 'object') throw new ApiConfigurationError('地址未返回有效认证响应');
    } else if (!Array.isArray(body.data) || body.object !== 'list') throw new ApiConfigurationError('地址未返回有效模型列表');
  } finally { await response.body?.cancel().catch(() => {}); }
}

export function apiSettingsPlugin(keys: ServerKeys, providerFetch: typeof fetch = byokFetch): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/settings/test') return next();
    const send = (status: number, value: object) => {
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(value));
      }
    };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (!trusted(req)) return send(403, { error: 'Host or Origin not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected application/json' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 16 * 1024) return send(413, { error: 'API 配置过长' });
        chunks.push(Buffer.from(chunk));
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(400, { error: 'API 配置格式错误' }); }
      const provider = apiProviders.find(item => item.id === input?.provider);
      if (!provider || typeof input.apiKey !== 'string') return send(400, { error: '请选择有效渠道商' });
      const custom = input.apiKey !== '';
      if (custom && (!validApiKey(input.apiKey) || typeof input.baseUrl !== 'string' || !validBaseUrl(input.baseUrl))) return send(400, { error: '请检查 Base URL 和 API Key 格式' });
      // A blank key uses the fixed server endpoint as well as its server key.
      const apiKey = custom ? input.apiKey : keys[provider.id];
      const baseUrl = custom ? input.baseUrl.replace(/\/+$/, '') : provider.baseUrl;
      if (!apiKey) return send(503, { error: '此渠道尚未配置默认 Key，请填写 API Key' });
      await checkApiConnection(provider.id, baseUrl, apiKey, controller.signal, providerFetch);
      controller.signal.throwIfAborted();
      send(200, { ok: true });
    } catch (error) {
      send(controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? '连接超时，请重试'
        : error instanceof ApiConfigurationError ? error.message : '无法连接，请检查地址和网络' });
    } finally {
      clearTimeout(timer);
      res.off('close', close);
    }
  };
  return {
    name: 'byok-api-settings',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
