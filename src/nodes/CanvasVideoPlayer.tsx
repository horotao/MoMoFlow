import { Play } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { MediaPlaybackControls } from './MediaPlaybackControls';
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
  const controls = <MediaPlaybackControls kind="视频" paused={paused} muted={muted} volume={volume} time={time} duration={duration}
    togglePlay={togglePlay} seek={seek} setMuted={setMuted} onVolume={next => {
      if (media.current) media.current.volume = next;
      setVolume(next);
    }} />;
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
