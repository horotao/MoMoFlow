import type { FileAsset } from './types';

export const seedanceAudioByteLimit = 15 * 1024 * 1024;
export function seedanceAudioFormat(asset: FileAsset) {
  if (asset.mimeType === 'audio/mpeg' || asset.mimeType === 'audio/mp3') return 'mp3';
  if (['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'].includes(asset.mimeType ?? '')) return 'wav';
  if (!asset.mimeType || asset.mimeType === 'application/octet-stream') {
    if (/\.mp3$/i.test(asset.name)) return 'mp3';
    if (/\.wav$/i.test(asset.name)) return 'wav';
  }
  throw new Error(`「${asset.name}」格式不兼容。Seedance 参考音频支持 MP3 或 WAV。`);
}
export function validateSeedanceAudio(assets: FileAsset[]) {
  let total = 0;
  for (const asset of assets) {
    seedanceAudioFormat(asset);
    if (!asset.size || asset.size > seedanceAudioByteLimit) throw new Error(`「${asset.name}」须为非空音频，每段最多 15 MB。`);
    const duration = asset.duration;
    if (!duration || !Number.isFinite(duration) || duration < 2 || duration > 30) {
      throw new Error(`「${asset.name}」须为 2–30 秒的参考音频，请使用符合时长的片段。`);
    }
    total += duration;
  }
  if (total > 30) throw new Error('Seedance 参考音频总时长最多 30 秒。');
}
