import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MediaPlaybackControls } from './MediaPlaybackControls';
import { audioPreview } from './audioPreview';

const silentPeaks = new Array<number>(54).fill(2);

export function AudioWaveform({ controlsHost, result }: { controlsHost: HTMLElement | null; result: import('./audioComposer').AudioResult }) {
  const asset = result.asset;
  const peaks = asset ? result.peaks ?? silentPeaks : audioPreview.peaks;
  const [duration, setDuration] = useState(asset ? asset.duration ?? 0 : audioPreview.duration);
  const media = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState(false);
  const fraction = duration ? time / duration : 0;
  function seek(seconds: number) {
    if (!media.current) return;
    media.current.currentTime = Math.max(0, Math.min(duration, seconds));
    setTime(media.current.currentTime);
  }
  function play() {
    const audio = media.current;
    if (!audio) return;
    if (audio.paused) {
      if (error) audio.load();
      setError(false);
      void audio.play().catch(() => setError(true));
    } else audio.pause();
  }
  return <div className="audio-waveform">
    <audio ref={media} src={asset?.url ?? audioPreview.url} onLoadedMetadata={e => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }} preload="auto" muted={muted}
      onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onError={() => setError(true)}
      onTimeUpdate={e => setTime(e.currentTarget.currentTime)} />
    <div className="audio-waveform-bars" onPointerMove={e => {
      const parent = e.currentTarget.parentElement;
      if (!parent) return;
      const box = parent.getBoundingClientRect();
      parent.style.setProperty('--audio-cursor', (e.clientX - box.left) / box.width * 100 + '%');
    }} onClick={e => {
      const box = e.currentTarget.getBoundingClientRect();
      seek((e.clientX - box.left) / box.width * duration);
    }}>
      {peaks.map((height, i) => <i key={i} aria-hidden="true"
        style={{ height }} data-played={i / (peaks.length - 1) < fraction || undefined} />)}
    </div>
    {error && <button type="button" className="audio-playback-error nodrag" onClick={play}>重试音频播放</button>}
    {controlsHost && createPortal(<MediaPlaybackControls kind="音频" paused={paused} muted={muted} volume={volume}
      time={time} duration={duration} togglePlay={play} seek={seek} setMuted={setMuted}
      onVolume={next => { if (media.current) media.current.volume = next; setVolume(next); }} />, controlsHost)}
  </div>;
}
