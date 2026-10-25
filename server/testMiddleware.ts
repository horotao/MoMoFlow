import assert from 'node:assert/strict';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';

// Only the middleware registration surface is needed by these isolated fixtures.
export function captureMiddleware(plugin: Plugin, hook: 'configureServer' | 'configurePreviewServer') {
  let middleware: Connect.NextHandleFunction | undefined;
  const configure = plugin[hook];
  assert.equal(typeof configure, 'function');
  if (typeof configure !== 'function') throw new Error(`Missing ${hook}`);
  configure({
    middlewares: { use(value: Connect.NextHandleFunction) { middleware = value; } },
  } as ViteDevServer & PreviewServer);
  assert.ok(middleware, `${hook} must register middleware`);
  return middleware;
}
