import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { requestSunburst } from './sunburstClient.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { ModelRequestCancelled } from './modelRequestError.ts';

test('client preserves provider details and request ID in the task error without retrying', async (context) => {
  const error = 'OpenAI 请求失败（500），不会自动重试。\n错误类型：provider_api_error\n服务商说明：Image editing failed\nRequest ID：mock-edit-123';
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    calls++;
    assert.equal(url, '/api/sunburst');
    return Response.json({ error, diagnostic: { status: 500, requestId: 'mock-edit-123' } }, { status: 502 });
  });
  await assert.rejects(requestSunburst({ ...defaultSunburstSettings, prompt: 'Test', images: [] }, new AbortController().signal), { message: error });
  assert.equal(calls, 1);
});

// Exercise the request boundary with controlled browser APIs; no provider is called.
function maskFixture(context: TestContext, values: number[], options: { width?: number; type?: string; onExport?: () => void; exportFails?: boolean; byok?: boolean } = {}) {
  const pixels = new Uint8ClampedArray(values);
  let exported: number[] | undefined;
  let body: Record<string, unknown> | undefined;
  let closed = 0;
  const uploads: string[] = [];
  const global = (name: string, value: unknown) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    context.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  };
  global('createImageBitmap', async (blob: Blob) => ({
    width: await blob.text() === 'source' ? pixels.length / 4 : options.width ?? pixels.length / 4,
    height: 1, close() { closed++; },
  }));
  global('document', { createElement: () => ({
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({ data: pixels.slice() }),
      putImageData: (image: ImageData) => { exported = [...image.data]; },
    }),
    toBlob: (callback: BlobCallback, type: string) => {
      options.onExport?.();
      callback(options.exportFails ? null : new Blob([JSON.stringify(exported)], { type }));
    },
  }) });
  global('FileReader', class {
    result?: string;
    onload?: () => void;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.();
      });
    }
  });
  if (options.byok) global('localStorage', { getItem: () => JSON.stringify({ provider: 'openai',
    credentials: { openai: { apiKey: 'fixture-only-key', baseUrl: 'https://provider.example/v1' } } }) });
  context.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url === 'https://provider.example/v1/files') {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-only-key');
      assert.ok(init?.body instanceof FormData);
      const file = init.body.get('file');
      assert.ok(file instanceof File);
      assert.equal(file.type, 'image/png');
      uploads.push(await file.text());
      return Response.json({ id: `file-ref${uploads.length}` });
    }
    if (url === '/api/sunburst') {
      body = JSON.parse(String(init?.body));
      assert.equal(new Headers(init?.headers).get('Accept'), 'image/*');
      return Response.json({ error: 'Mock API reached' }, { status: 502 });
    }
    assert.ok(['blob:source', 'blob:mask'].includes(url));
    return new Response(new Blob([url === 'blob:source' ? 'source' : 'mask'], { type: url === 'blob:mask' ? options.type ?? 'image/png' : 'image/png' }));
  });
  return { pixels, uploads, exported: () => exported, body: () => body, closed: () => closed };
}

const maskedRequest = { ...defaultSunburstSettings, prompt: 'Edit', images: ['blob:source'], mask: 'blob:mask', maskMode: 'luminance' as const };

test('official BYOK sends reference and mask bytes only to Files, then sends only IDs to the app', async context => {
  const f = maskFixture(context, [255, 255, 255, 128, 0, 0, 0, 255], { byok: true });
  await assert.rejects(requestSunburst(maskedRequest, new AbortController().signal), /Mock API reached/);
  assert.deepEqual(f.uploads, ['source', 'mask']);
  assert.deepEqual(f.body()?.images, ['file-ref1']);
  assert.equal(f.body()?.mask, 'file-ref2');
  assert.doesNotMatch(JSON.stringify(f.body()), /data:image|blob:|fixture-only-key/);
});

test('official binary response detects incomplete downloads without starting a second generation', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/png', 'X-MoMoFlow-Image-Bytes': '10' } });
  });
  await assert.rejects(requestSunburst({ ...defaultSunburstSettings, prompt: 'Example', images: [] }, new AbortController().signal), /回传不完整/);
  assert.equal(requests, 1);
});

test('opaque inverted mask becomes alpha with white editable, black protected and gray soft edges', async context => {
  const f = maskFixture(context, [255, 255, 255, 255, 0, 0, 0, 255, 191, 191, 191, 255, 64, 64, 64, 255]);
  await assert.rejects(requestSunburst(maskedRequest, new AbortController().signal), /Mock API reached/);
  assert.deepEqual(f.exported(), [0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 64, 0, 0, 0, 191]);
  assert.deepEqual([...f.pixels], [255, 255, 255, 255, 0, 0, 0, 255, 191, 191, 191, 255, 64, 64, 64, 255]);
  const body = f.body()!;
  assert.equal(body.mask, `data:image/png;base64,${Buffer.from(JSON.stringify(f.exported())).toString('base64')}`);
  assert.deepEqual(body.images, [`data:image/png;base64,${Buffer.from('source').toString('base64')}`]);
  assert.equal('maskMode' in body, false);
  assert.equal(maskedRequest.mask, 'blob:mask');
  assert.equal(f.closed(), 2);
});

test('existing transparent masks retain original bytes, including Invert outputs with alpha', async context => {
  const f = maskFixture(context, [255, 255, 255, 128, 0, 0, 0, 255]);
  for (const maskMode of [undefined, 'luminance'] as const) {
    await assert.rejects(requestSunburst({ ...maskedRequest, maskMode }, new AbortController().signal), /Mock API reached/);
    assert.equal(f.body()?.mask, `data:image/png;base64,${Buffer.from('mask').toString('base64')}`);
    assert.equal(f.exported(), undefined);
  }
});

test('ordinary opaque masks and all-black Invert masks still reject before API submission', async context => {
  const f = maskFixture(context, [0, 0, 0, 255]);
  for (const maskMode of [undefined, 'luminance'] as const) {
    await assert.rejects(requestSunburst({ ...maskedRequest, maskMode }, new AbortController().signal), /Mask 需要透明区域/);
    assert.equal(f.body(), undefined);
  }
});

test('Invert mask dimension mismatch fails before conversion or API submission', async context => {
  const f = maskFixture(context, [255, 255, 255, 255], { width: 2 });
  await assert.rejects(requestSunburst(maskedRequest, new AbortController().signal), /Mask 尺寸/);
  assert.equal(f.body(), undefined);
  assert.equal(f.exported(), undefined);
  assert.equal(f.closed(), 2);
});

test('non-PNG Invert masks remain invalid', async context => {
  const f = maskFixture(context, [255, 255, 255, 255], { type: 'image/jpeg' });
  await assert.rejects(requestSunburst(maskedRequest, new AbortController().signal), /PNG/);
  assert.equal(f.body(), undefined);
});

test('cancelling during mask export prevents API submission and releases bitmaps', async context => {
  const controller = new AbortController();
  const f = maskFixture(context, [255, 255, 255, 255], { onExport: () => controller.abort() });
  await assert.rejects(requestSunburst(maskedRequest, controller.signal), { name: 'AbortError' });
  assert.equal(f.body(), undefined);
  assert.equal(f.closed(), 2);
});

test('mask PNG export failures prevent API submission and release bitmaps', async context => {
  const f = maskFixture(context, [255, 255, 255, 255], { exportFails: true });
  await assert.rejects(requestSunburst(maskedRequest, new AbortController().signal), /无法导出 Mask/);
  assert.equal(f.body(), undefined);
  assert.equal(f.closed(), 2);
});

test('SVG client keeps streamed UTF-8 XML as an SVG blob without decoding to a bitmap', async context => {
  const xml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path d="M0 0h10v10z"/><text y="30">矢量</text></svg>';
  const nativeFetch = globalThis.fetch;
  context.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (url === '/api/sunburst') return new Response(xml, { headers: {
      'Content-Type': 'image/svg+xml', 'X-MoMoFlow-Image-Bytes': String(Buffer.byteLength(xml)),
    } });
    return nativeFetch(url, init);
  });
  const asset = await requestSunburst({ ...defaultSunburstSettings, outputFormat: 'svg', variant: 'Flare', prompt: 'vector', images: [] }, new AbortController().signal);
  try {
    assert.match(asset.name, /^Flare-.*\.svg$/);
    assert.equal(asset.width, 640); assert.equal(asset.height, 480);
    const blob = await (await nativeFetch(asset.url)).blob();
    assert.equal(blob.type, 'image/svg+xml'); assert.equal(await blob.text(), xml);
  } finally { URL.revokeObjectURL(asset.url); }
});

test('APIMart remote cancellation stops polling and keeps the task ID without another generation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    paths.push(url);
    if (url === '/api/apimart/images') return Response.json({ taskId: 'task_remote_cancelled' });
    assert.equal(url, '/api/apimart/task');
    assert.deepEqual(JSON.parse(String(init?.body)), { taskId: 'task_remote_cancelled', outputFormat: 'png' });
    return Response.json({ status: 'cancelled', taskId: 'task_remote_cancelled' });
  });
  const pending = requestSunburst({ ...defaultSunburstSettings, provider: 'apimart', prompt: 'A circle', images: [] }, new AbortController().signal);
  for (let index = 0; index < 80; index++) await Promise.resolve();
  assert.deepEqual(paths, ['/api/apimart/images']);
  t.mock.timers.tick(4000);
  await assert.rejects(pending, error => error instanceof ModelRequestCancelled && /task_remote_cancelled/.test(error.message));
  t.mock.timers.tick(40000);
  assert.deepEqual(paths, ['/api/apimart/images', '/api/apimart/task']);
});

test('APIMart URL SVG results preserve vector bytes and reject unsafe SVG without resubmission', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const nativeFetch = globalThis.fetch;
  for (const unsafe of [false, true]) {
    let submissions = 0;
    const xml = unsafe ? '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path d="M0 0h10v10z"/></svg>';
    const mock = t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      if (url === '/api/apimart/images') { submissions++; return Response.json({ taskId: 'task_vector' }); }
      if (url === '/api/apimart/task') return Response.json({ status: 'completed', imageUrl: 'https://cdn.example/result.svg', format: 'svg' });
      assert.equal(url, 'https://cdn.example/result.svg'); assert.equal(init?.headers, undefined);
      return new Response(xml, { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } });
    });
    const pending = requestSunburst({ ...defaultSunburstSettings, provider: 'apimart', channelModel: 'gpt-image-2.6', outputFormat: 'svg', prompt: 'Vector', images: [] }, new AbortController().signal);
    const checked = unsafe ? assert.rejects(pending, /task_vector/) : pending;
    await new Promise<void>(resolve => setImmediate(resolve)); t.mock.timers.tick(4000);
    if (unsafe) await checked;
    else {
      const asset = await pending;
      assert.equal(asset.width, 640); assert.equal(asset.height, 480);
      assert.ok(asset.url.startsWith('blob:'));
      assert.equal(await (await nativeFetch(asset.url)).text(), xml);
      URL.revokeObjectURL(asset.url);
    }
    assert.equal(submissions, 1); mock.mock.restore();
  }
});
