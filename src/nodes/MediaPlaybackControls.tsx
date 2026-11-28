import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { videoTimeLabel } from './fileMedia';
import './CanvasVideoPlayer.css';

export function MediaPlaybackControls({ kind, paused, muted, volume, time, duration, togglePlay, seek, setMuted, onVolume }: {
  kind: '视频' | '音频'; paused: boolean; muted: boolean; volume: number; time: number; duration: number;
  togglePlay: () => void; seek: (seconds: number) => void; setMuted: (value: boolean) => void; onVolume: (value: number) => void;
}) {
  const quiet = muted || !volume;
  const audibleVolume = quiet ? 0 : volume;
  return <div className="canvas-video-controls nodrag nopan nowheel" role="group" aria-label={kind + '播放控件'}>
      <div className="canvas-video-controls-body">
        <button type="button" aria-label={paused ? '播放' : '暂停'} onClick={togglePlay}>
          {paused ? <Play className="canvas-video-play-icon" fill="currentColor" strokeWidth={0} /> : <Pause />}
        </button>
        <div className="canvas-video-volume">
          <button type="button" aria-label={quiet ? '取消静音' : '静音'} onClick={() => {
            if (quiet && !volume) onVolume(1);
            setMuted(!quiet);
          }}>{quiet ? <VolumeX /> : <Volume2 />}</button>
          <div className="canvas-video-volume-slider">
            <div className="canvas-video-track" aria-hidden="true"><span style={{ transform: `scaleX(${audibleVolume})` }} /></div>
            <input type="range" aria-label="音量" min="0" max="1" step="0.01" value={audibleVolume}
              aria-valuetext={`${Math.round(audibleVolume * 100)}%`}
              onChange={event => {
                const next = event.currentTarget.valueAsNumber;
                onVolume(next); setMuted(next === 0);
              }} />
          </div>
        </div>
        <span className="canvas-video-clock">{videoTimeLabel(time)} / {videoTimeLabel(duration)}</span>
        <div className="canvas-video-scrubber">
          <div className="canvas-video-track" aria-hidden="true"><span style={{ transform: `scaleX(${duration ? time / duration : 0})` }} /></div>
          <input type="range" aria-label={kind + '播放进度'} min={0} max={duration} step="any" value={time} disabled={!duration}
            aria-valuetext={`${videoTimeLabel(time)} / ${videoTimeLabel(duration)}`} onChange={event => seek(event.currentTarget.valueAsNumber)}
            onKeyDown={event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault(); event.stopPropagation(); seek(time + (event.key === 'ArrowLeft' ? -1 : 1));
            }} />
        </div>
      </div>
    </div>;
}
