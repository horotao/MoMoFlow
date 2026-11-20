import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import handler from './vercelHandler.ts';

test('hosted BYOK routes reject untrusted requests and never use server keys', async (t) => {
  const previous = { ...process.env };
  Object.assign(process.env, { VERCEL: '1', VERCEL_URL: 'preview.vercel.app', OPENAI_API_KEY: 'must-not-be-used' });
  t.after(() => { process.env = previous; });
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = (path: string, body = '{}', headers: Record<string, string> = {}) => new Promise<{ status: number; json: () => Promise<{ error: string }> }>((resolve, reject) => {
    const req = httpRequest(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST', headers: { host: 'preview.vercel.app', origin: 'https://preview.vercel.app', 'content-type': 'application/json', ...headers },
    }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, json: async () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body);
  });
  for (const path of ['/api/sunburst', '/api/nano-banana', '/api/apimart/images', '/api/apimart/seedream', '/api/apimart/task']) {
    const response = await request(path);
    assert.equal(response.status, 401, path);
    assert.match((await response.json()).error, /API Key/);
  }
  assert.equal((await request('/api/settings/test', JSON.stringify({ provider: 'openai', apiKey: '' }))).status, 503);
  assert.equal((await request('/api/settings/test', '{')).status, 400);
  assert.equal((await request('/api/sunburst', '{}', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/api/sunburst', '{}', { host: 'evil.example', origin: 'https://evil.example' })).status, 403);
  for (const path of ['/api/unknown', '/api/ideogram', '/api/ideogram/edit']) assert.equal((await request(path)).status, 404);
  assert.equal((await request('/api/sunburst', '{}', { 'x-momoflow-api-key': 'invalid key' })).status, 400);
  const deepseekHeaders = {
    'x-momoflow-provider': 'deepseek', 'x-momoflow-api-key': 'test-key', 'x-momoflow-base-url': 'https://api.deepseek.com',
  };
  const inlineDescription = (data: string) => JSON.stringify({ model: 'deepseek-flash', instructions: '', images: [`data:image/png;base64,${data}`] });
  assert.equal((await request('/api/describer', inlineDescription('aGVsbG8='), deepseekHeaders)).status, 404);
  assert.equal((await request('/api/describer', inlineDescription('a'.repeat(128 * 1024)), deepseekHeaders)).status, 404);
  process.env.VERCEL = '';
  assert.equal((await request('/api/settings/test')).status, 403);
});
