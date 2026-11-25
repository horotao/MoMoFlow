import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiSettingsMiddleware } from './apiSettings.ts';
import { createApimartMiddleware } from './apimart.ts';
import { createSunburstMiddleware } from './sunburst.ts';
import { createTextMiddleware } from './text.ts';
import { trustedDeploymentRequest } from './providerDiagnostics.ts';

// Never load server/default credentials in the hosted BYOK deployment.
const handlers = [
  createTextMiddleware({}),
  createApiSettingsMiddleware({ openai: '', apimart: '', deepseek: '' }),
  createApimartMiddleware(''),
  createSunburstMiddleware(''),
];
const paths = new Set([
  '/api/settings/test', '/api/apimart/balance', '/api/apimart/images', '/api/apimart/seedream', '/api/apimart/kling', '/api/apimart/grok', '/api/apimart/task', '/api/apimart/videos', '/api/apimart/video-task',
  '/api/apimart/music', '/api/apimart/music-task', '/api/nano-banana', '/api/sunburst', '/api/text',
]);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, error: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error }));
  };
  if (!trustedDeploymentRequest(req)) return send(403, 'Host or Origin not allowed');
  const path = req.url?.split('?')[0] ?? '';
  if (!paths.has(path)) return send(404, 'API not found');
  if (req.method !== 'POST') return send(405, 'Method not allowed');
  if (path !== '/api/settings/test' && !req.headers['x-momoflow-api-key']) {
    return send(401, '请先在「更多 → API 设置」填写对应渠道的 API Key。线上版本不提供默认 Key。');
  }
  for (const middleware of handlers) {
    let skipped = false;
    await middleware(req, res, () => { skipped = true; });
    if (!skipped) return;
  }
  send(404, 'API not found');
}
