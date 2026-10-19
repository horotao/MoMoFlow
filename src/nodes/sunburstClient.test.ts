import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSunburst } from './sunburstClient.ts';
import { defaultSunburstSettings } from './sunburst.ts';

test('client preserves provider details and request ID in the task error without retrying', async (context) => {
  const error = 'ZenMux 请求失败（500），不会自动重试。\n错误类型：provider_api_error\n服务商说明：Image editing failed\nRequest ID：mock-edit-123';
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    calls++;
    assert.equal(url, '/api/sunburst');
    return Response.json({ error, diagnostic: { status: 500, requestId: 'mock-edit-123' } }, { status: 502 });
  });
  await assert.rejects(requestSunburst({ ...defaultSunburstSettings, prompt: 'Test', images: [] }, new AbortController().signal), { message: error });
  assert.equal(calls, 1);
});
