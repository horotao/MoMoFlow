import type { CanvasAudio, FileAsset } from './types';

// Peak heights sampled in equal time windows from the bundled preview.
export const audioPreview = {
  url: new URL('./assets/audio-preview.wav', import.meta.url).href,
  duration: 4.5,
  bytes: 216044,
  peaks: [2, 2, 70, 129, 69, 36, 158, 143, 68, 35, 101, 74, 39, 160, 89, 49, 23, 83, 110, 56, 29, 91, 66, 36, 17, 9, 4, 2, 2, 131, 77, 153, 129, 72, 38, 98, 92, 45, 110, 86, 45, 111, 103, 50, 92, 91, 43, 21, 11, 5, 3, 2, 2, 2],
};

export function selectedAudioAsset(data: CanvasAudio['data']): FileAsset | undefined {
  const result = data.audioHistory?.find(item => item.id === data.activeAudioId) ?? data.audioHistory?.[0];
  if (!result) return;
  // Legacy preview history played this bundled WAV before generated files were stored.
  return result.asset ?? { id: result.id, kind: 'audio', name: data.label + '.wav', url: audioPreview.url,
    mimeType: 'audio/wav', duration: audioPreview.duration, size: audioPreview.bytes };
}
