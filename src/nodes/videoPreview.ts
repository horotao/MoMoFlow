import segmentEnds from './assets/video-preview/segments.json';
import { readCanvasVideo } from './importCanvasVideo';
import type { VideoComposer } from './types';

const clips = {
  wide: new URL('./assets/video-preview/wide.mp4', import.meta.url).href,
  tall: new URL('./assets/video-preview/tall.mp4', import.meta.url).href,
  square: new URL('./assets/video-preview/square.mp4', import.meta.url).href,
};

// Each bundled silent MP4 has ten independently playable one-second fragments.
// Taking a prefix at a fragment boundary preserves native seeking and export duration.
export async function readVideoPreview(composer: VideoComposer, signal: AbortSignal) {
  const format = composer.ratio === '9:16' ? 'tall' : composer.ratio === '1:1' ? 'square' : 'wide';
  const response = await fetch(clips[format], { signal });
  if (!response.ok) throw new Error('视频预览加载失败。');
  const bytes = await response.blob();
  const end = segmentEnds[format][composer.seconds - 1];
  if (!end || bytes.size < end) throw new Error('视频预览数据不完整。');
  signal.throwIfAborted();
  return readCanvasVideo(new File([bytes.slice(0, end)], 'Sunbeam Particles.mp4', { type: 'video/mp4' }));
}
