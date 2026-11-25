import { apiCredentialHeaders } from '../components/apiSettings.ts';
import type { FileAsset } from './types';
import { assetResources } from './assetResources.ts';
import { audioModel, type AudioResult } from './audioComposer.ts';
import { downloadMedia, requestMediaTask } from './apimartMediaClient.ts';
import { sunoRequest, type SunoFormat, type SunoOptions, type SunoTrack } from './suno.ts';

const audioMimes = {
  mp3: ['audio/mpeg', 'audio/mp3'], m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'video/mp4'],
  wav: ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'],
} satisfies Record<SunoFormat, string[]>;

async function analyzeAudio(blob: Blob) {
  // Downsample for waveform display, keeping the original file for playback and download.
  const context = new OfflineAudioContext(1, 1, 12000);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  const peaks = new Array<number>(54).fill(0);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let bin = 0; bin < peaks.length; bin++) {
      const end = Math.floor((bin + 1) * samples.length / peaks.length);
      let peak = peaks[bin];
      for (let i = Math.floor(bin * samples.length / peaks.length); i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
      peaks[bin] = peak;
    }
  }
  const scale = 160 / (Math.max(...peaks) || 1);
  return { duration: audio.duration, peaks: peaks.map(peak => Math.max(2, Math.round(peak * scale))) };
}

export function generateSunoAudio(prompt: string, options: SunoOptions, signal: AbortSignal,
  onSubmitted: (taskId: string) => void, onProgress: (fraction: number) => void, onTrack: (result: AudioResult & { asset: FileAsset }) => void) {
  const input = { prompt, ...options };
  sunoRequest(input);
  return requestMediaTask({ label: '音乐', submitPath: '/api/apimart/music', taskPath: '/api/apimart/music-task',
    input, headers: apiCredentialHeaders('apimart'), signal, onSubmitted, onProgress,
    readResult: async (data, taskId) => {
      if (!Array.isArray(data.tracks) || !data.tracks.length) throw new Error('Suno 未返回音轨。');
      for (const [index, track] of (data.tracks as SunoTrack[]).entries()) {
        const allowed = audioMimes[options.audio_format];
        const clip = await downloadMedia(track.url, signal, '音频', allowed[0], allowed, 256);
        const analysis = await analyzeAudio(clip).catch(() => undefined);
        signal.throwIfAborted();
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        const title = track.title || 'Suno V6-' + (index + 1);
        onTrack({ id, createdAt, model: audioModel.id, prompt, suno: options, taskId, peaks: analysis?.peaks,
          asset: { id, kind: 'audio', url: assetResources.create(clip), name: title + '.' + options.audio_format,
            mimeType: clip.type, size: clip.size, createdAt, duration: analysis?.duration ?? track.duration } });
      }
    },
  });
}
