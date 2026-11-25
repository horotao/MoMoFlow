import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { videoTimeLabel } from './fileMedia';
import type { FileAsset } from './types';
import './CanvasVideoPlayer.css';

export function CanvasVideoPlayer({ asset, playerRef, controlsHost, onMetadata, onDownload }: {
  asset: FileAsset; playerRef: RefObject<HTMLDivElement>; controlsHost?: HTMLElement | null;
  onMetadata: (width: number, height: number, duration: number) => void; onDownload: () => void;
}) {
  const media = useRef<HTMLVideoElement>(null);
  const previewTimeout = useRef<number>();
  useEffect(() => () => window.clearTimeout(previewTimeout.current), []);
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const quiet = muted || !volume;

  const audibleVolume = quiet ? 0 : volume;

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [playerRef]);

  function retryPreview() {
    setError('');
    setTime(0);
    setPaused(true);
    media.current?.load();
  }

  function togglePlay() {
    const video = media.current;
    if (!video) return;
    if (!video.paused) { video.pause(); return; }
    setError('');
    void video.play().catch((cause: Error) => {
      if (cause.name !== 'AbortError') setError('此视频暂时无法播放。');
    });
  }
  function seek(seconds: number) {
    if (!media.current || !duration) return;
    media.current.currentTime = Math.max(0, Math.min(duration, seconds));
    setTime(media.current.currentTime);
  }
  const controls = <div className="canvas-video-controls nodrag nopan nowheel" role="group" aria-label="视频播放控件">
      <div className="canvas-video-controls-body">
        <button type="button" aria-label={paused ? '播放' : '暂停'} onClick={togglePlay}>
          {paused ? <Play fill="currentColor" strokeWidth={0} /> : <Pause />}
        </button>
        <div className="canvas-video-volume">
          <button type="button" aria-label={quiet ? '取消静音' : '静音'} onClick={() => {
            if (quiet && !volume && media.current) { media.current.volume = 1; setVolume(1); }
            setMuted(!quiet);
          }}>{quiet ? <VolumeX /> : <Volume2 />}</button>
          <div className="canvas-video-volume-slider">
            <div className="canvas-video-track" aria-hidden="true"><span style={{ transform: `scaleX(${audibleVolume})` }} /></div>
            <input type="range" aria-label="音量" min="0" max="1" step="0.01" value={audibleVolume}
              aria-valuetext={`${Math.round(audibleVolume * 100)}%`}
              onChange={event => {
                const next = event.currentTarget.valueAsNumber;
                if (media.current) media.current.volume = next;
                setVolume(next); setMuted(next === 0);
              }} />
          </div>
        </div>
        <span className="canvas-video-clock">{videoTimeLabel(time)} / {videoTimeLabel(duration)}</span>
        <div className="canvas-video-scrubber">
          <div className="canvas-video-track" aria-hidden="true"><span style={{ transform: `scaleX(${duration ? time / duration : 0})` }} /></div>
          <input type="range" aria-label="视频播放进度" min={0} max={duration} step="any" value={time} disabled={!duration}
            aria-valuetext={`${videoTimeLabel(time)} / ${videoTimeLabel(duration)}`} onChange={event => seek(event.currentTarget.valueAsNumber)}
            onKeyDown={event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault(); event.stopPropagation(); seek(time + (event.key === 'ArrowLeft' ? -1 : 1));
            }} />
        </div>
      </div>
    </div>;
  return <div className="canvas-video-player" ref={playerRef}>
    <video ref={media} src={asset.url} aria-label={asset.name} playsInline loop muted={muted} preload="auto"
      onClick={togglePlay} onPlay={() => setPaused(false)} onPause={() => setPaused(true)}
      onLoadStart={() => {
        window.clearTimeout(previewTimeout.current);
        previewTimeout.current = window.setTimeout(() => {
          if (media.current && media.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) setError('视频预览加载超时');
        }, 15000);
      }}
      onLoadedMetadata={({ currentTarget: video }) => {
        if (Number.isFinite(video.duration)) {
          setDuration(video.duration);
          if (video.videoWidth && video.videoHeight) onMetadata(video.videoWidth, video.videoHeight, video.duration);
        }
      }}
      onLoadedData={() => { window.clearTimeout(previewTimeout.current); setError(''); }}
      onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
      onError={() => { window.clearTimeout(previewTimeout.current); setError('视频预览失败'); }} />
    {paused && !error && <button type="button" className="canvas-video-center nodrag nopan" aria-label="播放视频" onClick={togglePlay}>
      <Play size={32} fill="currentColor" strokeWidth={0} />
    </button>}
    {error && <div className="canvas-video-error nodrag nopan" onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}>
      <span role="alert">{error}</span>
      <div><button type="button" onClick={retryPreview}>重试预览</button><button type="button" onClick={onDownload}>下载原片</button></div>
    </div>}
    {!error && (controlsHost && !fullscreen ? createPortal(controls, controlsHost) : controls)}
  </div>;
}
