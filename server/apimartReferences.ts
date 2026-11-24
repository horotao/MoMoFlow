import { apimartInputUrl } from '../src/nodes/apimartResult.ts';

export function parseReferenceImages(sources: unknown[]) {
  let total = 0;
  return sources.map((source: unknown, index: number) => {
    if (typeof source === 'string' && !source.startsWith('data:')) return apimartInputUrl(source);
    // Local default-key requests upload the file server-side.
    const match = typeof source === 'string' ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source) : null;
    if (!match || !['image/png', 'image/jpeg', 'image/webp'].includes(match[1]) || match[2].length % 4 !== 0) {
      throw new Error('参考图需为 PNG、JPEG 或 WebP。');
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('单张参考图片必须非空且不能超过 20 MiB。');
    total += bytes.length;
    if (total > 46 * 1024 * 1024) throw new Error('参考图片总大小不能超过 46 MiB。');
    return { blob: new Blob([new Uint8Array(bytes)], { type: match[1] }), filename: `reference-${index + 1}.${match[1].slice(6)}` };
  });
}
