import test, { type TestContext } from 'node:test';
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

// Exercise the request boundary with controlled browser APIs; no provider is called.
function maskFixture(context: TestContext, values: number[], options: { width?: number; type?: string; onExport?: () => void; exportFails?: boolean } = {}) {
  const pixels = new Uint8ClampedArray(values);
  let exported: number[] | undefined;
  let body: Record<string, unknown> | undefined;
  let closed = 0;
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
  context.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/sunburst') {
      body = JSON.parse(String(init?.body));
      return Response.json({ error: 'Mock API reached' }, { status: 502 });
    }
    assert.ok(['blob:source', 'blob:mask'].includes(url));
    return new Response(new Blob([url === 'blob:source' ? 'source' : 'mask'], { type: url === 'blob:mask' ? options.type ?? 'image/png' : 'image/png' }));
  });
  return { pixels, exported: () => exported, body: () => body, closed: () => closed };
}

const maskedRequest = { ...defaultSunburstSettings, prompt: 'Edit', images: ['blob:source'], mask: 'blob:mask', maskMode: 'luminance' as const };

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
