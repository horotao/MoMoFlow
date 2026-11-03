export type NodePortKind = 'text' | 'image' | 'mask' | 'file' | 'video' | 'audio' | '3d' | 'variable' | 'unknown';

export const nodeConnectionColors = { text: '#5F5F5F', image: '#80B9F1', mask: '#80B9F1' };

export function nodePortColor(kind: NodePortKind = 'unknown') {
  if (kind === 'text' || kind === 'variable') return nodeConnectionColors.text;
  if (kind === 'image' || kind === 'mask') return nodeConnectionColors.image;
  if (kind === 'unknown') return '#5F5F5F';
  return { file: 'var(--media-port-file, #f3ffe3)', video: 'var(--media-port-video, #a7b5ff)', audio: 'var(--media-port-audio, #ffce94)', '3d': 'var(--media-port-3d, #ffadce)' }[kind];
}
