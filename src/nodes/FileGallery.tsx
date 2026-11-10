import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Check } from 'lucide-react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { animate, type AnimationPlaybackControls } from 'motion';
import { useReducedMotion } from 'motion/react';
import { exitFallbackMs, spring } from '../lib/springs';
import { assetResources, writeAssetClipboard } from './assetResources';
import { FileIcon } from './FileIcon';
import { FileActionMenu } from './FileActionMenu';
import { copyAssetImage, downloadAsset, downloadAssets } from './fileMedia';
import type { FileAsset } from './types';

type Props = {
  assets: FileAsset[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  imageTransition?: { trigger: HTMLElement; keyboard: boolean; findThumbnail: (id: string) => HTMLImageElement | null };
};

// Thumbnail morph inspired by https://beui.dev/components/motion/image-viewer.
// Compare viewport coordinates so React Flow's canvas zoom and pan are included.
function thumbnailBounds(image: HTMLImageElement | null) {
  if (!image?.naturalWidth) return;
  const rect = image.getBoundingClientRect();
  const clip = image.closest('.node-image-grid, .file-node-media')?.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight ||
    (clip && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1))) return;
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}

function project(from: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, to: DOMRect) {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

const galleryLayers = '.file-gallery-backdrop, .file-gallery-header, .file-gallery-sidebar';
// BeUI Image Viewer's shared-layout spring, for the longer trip from canvas to viewer.
const thumbnailMorphSpring = { type: 'spring', stiffness: 360, damping: 32, mass: 0.6 } as const;
const thumbnailReturn = { duration: spring.slow.duration, ease: 'easeInOut' } as const;

export function FileGallery({ assets, activeId, onSelect, onClose, imageTransition }: Props) {
  useLayoutEffect(() => assetResources.retain(assets.map(asset => asset.url)), [assets]);
  const index = Math.max(0, assets.findIndex((item) => item.id === activeId));
  const asset = assets[index];
  const panel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const playback = useRef<AnimationPlaybackControls[]>([]);
  const restoreThumbnail = useRef<() => void>();
  const opened = useRef(false);
  const closing = useRef(false);
  const exitTimer = useRef<number>();
  const reduce = useReducedMotion();
  const trigger = imageTransition?.trigger;
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const gesture = useRef<{ x: number; y: number; panX: number; panY: number }>();
  const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
  const fit = Math.min(bounds.width * .9 / 460, bounds.height * .9 / (460 / ratio));
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
    const element = stage.current!;
    observer.observe(element);
    setBounds({ width: element.clientWidth, height: element.clientHeight });
    const previous = document.activeElement as HTMLElement | null;
    const app = trigger?.closest<HTMLElement>('#root');
    const wasInert = app?.inert ?? false;
    panel.current?.focus({ preventScroll: true });
    if (app) app.inert = true;
    return () => {
      observer.disconnect();
      playback.current.forEach(animation => animation.stop());
      restoreThumbnail.current?.();
      opened.current = false;
      window.clearTimeout(exitTimer.current);
      if (app) app.inert = wasInert;
      (trigger?.isConnected ? trigger : previous)?.focus({ preventScroll: true });
    };
  }, [trigger]);
  useLayoutEffect(() => {
    if (!imageTransition || opened.current || fit <= 0) return;
    opened.current = true;
    if (imageTransition.keyboard) return;
    const image = picture.current;
    const element = panel.current!;
    const from = reduce ? undefined : thumbnailBounds(imageTransition.findThumbnail(asset.id));
    const to = image?.getBoundingClientRect();
    const layers = element.querySelectorAll<HTMLElement>(galleryLayers);
    // Motion applies keyframes on its next tick. Set the starting styles before the portal paints.
    layers.forEach(layer => { layer.style.opacity = '0'; });
    const fade = animate(layers, { opacity: 1 }, spring.moderate);
    if (image && from && to?.width && to.height) {
      const start = project(from, to);
      image.style.transform = start;
      element.dataset.morphing = '';
      const move = animate(image, { transform: [start, project(to, to)] }, thumbnailMorphSpring);
      playback.current = [fade, move];
      void move.then(() => { if (!closing.current) delete element.dataset.morphing; });
    } else {
      playback.current = [fade];
      if (image) {
        image.style.opacity = '0';
        playback.current.push(animate(image, { opacity: 1 }, spring.moderate));
      }
    }
  }, [asset.id, fit, imageTransition, reduce]);
  const close = () => {
    if (closing.current) return;
    if (!imageTransition) { onClose(); return; }
    closing.current = true;
    const element = panel.current!;
    const image = picture.current;
    const from = image?.getBoundingClientRect();
    const base = image?.parentElement?.getBoundingClientRect();
    const thumbnail = !reduce && zoom === 1 && pan.x === 0 && pan.y === 0 ? imageTransition.findThumbnail(asset.id) : null;
    const to = thumbnailBounds(thumbnail);
    playback.current.forEach(animation => animation.stop());
    const layers = element.querySelectorAll(galleryLayers);
    let exit: { duration: number } = spring.slow.exit;
    if (image && from && base?.width && base.height && thumbnail && to) {
      element.dataset.morphing = '';
      const start = project(from, base);
      const previousOpacity = thumbnail.style.opacity;
      const imageOpacity = Number(getComputedStyle(image).opacity);
      image.style.transform = start;
      thumbnail.style.opacity = '0';
      restoreThumbnail.current = () => { thumbnail.style.opacity = previousOpacity; };
      exit = thumbnailReturn;
      // Bring back the canvas copy just before fading the moving copy at the landing.
      playback.current = [
        animate(layers, { opacity: 0 }, thumbnailReturn),
        animate(image, { transform: [start, project(to, base)] }, thumbnailReturn),
        animate(thumbnail, { opacity: [0, 0, 1, 1] }, { duration: exit.duration, times: [0, .84, .94, 1], ease: 'linear' }),
        animate(image, { opacity: [imageOpacity, imageOpacity, 0] }, { duration: exit.duration, times: [0, .94, 1], ease: 'linear' }),
      ];
    } else {
      playback.current = [animate(layers, { opacity: 0 }, exit)];
      if (image) playback.current.push(animate(image, { opacity: 0 }, exit));
    }
    element.dataset.closing = '';
    const finish = () => {
      if (!element.isConnected || exitTimer.current === undefined) return;
      window.clearTimeout(exitTimer.current);
      exitTimer.current = undefined;
      onClose();
    };
    exitTimer.current = window.setTimeout(finish, exitFallbackMs({ exit }));
    void Promise.all(playback.current).then(finish);
  };
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setError(''); setCopied(false); setNotice(''); }, [asset.id]);
  useEffect(() => {
    const element = stage.current!;
    const wheel = (event: WheelEvent) => { event.preventDefault(); if (!closing.current) setZoom((value) => Math.min(12, Math.max(.1, value * Math.exp(-event.deltaY * .002)))); };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const run = (action: () => Promise<void>, success = '') => { setError(''); setNotice(''); setCopied(false); void action().then(() => setNotice(success)).catch((error: unknown) => setError(error instanceof Error ? error.message : 'This action could not be completed.')); };
  return createPortal(<div ref={panel} className={`file-gallery nodrag nopan nowheel${imageTransition ? ' file-gallery-morph' : ''}`} role="dialog" aria-modal="true" aria-label="File image viewer" tabIndex={-1}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (closing.current) { event.preventDefault(); return; }
      if (event.target instanceof HTMLElement && event.target.closest('[role="menu"]')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); onSelect(assets[(index + (event.key === 'ArrowRight' ? 1 : -1) + assets.length) % assets.length].id);
      }
      if (event.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      if (event.key === 'Tab') {
        const buttons = Array.from(panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (event.shiftKey && (document.activeElement === buttons[0] || document.activeElement === panel.current)) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
      }
    }} onPointerDown={(event) => event.stopPropagation()}>
    {imageTransition && <div className="file-gallery-backdrop" aria-hidden="true" onClick={close} />}
    <div className="file-gallery-main">
      <header className="file-gallery-header">
        <div className="file-gallery-title"><button className="file-icon-button" aria-label="Close" title="Close (Esc)" onClick={close}>{imageTransition ? <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden="true" /> : <FileIcon name="close" />}</button><span title={imageTransition ? asset.name : undefined}>{imageTransition ? asset.name : 'File'}</span></div>
        <div className="file-gallery-tools">
          <span className="file-gallery-zoom" title="Scroll to zoom · Double-click to reset">{Math.round(fit * zoom * 100)}%</span><span className="file-gallery-divider" />
          <FileActionMenu label="下载" items={[
            { label: '下载', action: () => run(() => downloadAsset(asset)) },
            ...(assets.length > 1 ? [{ label: '下载全部', action: () => run(() => downloadAssets(assets)) }] : []),
            ...(asset.kind === 'image' ? [{ label: '复制图片', action: () => run(() => copyAssetImage(asset), '已复制图片') }] : []),
          ]}><FileIcon name="download" /></FileActionMenu>
          <button className="file-icon-button" aria-label="Copy link" title={asset.url.startsWith('blob:') ? 'Copy link (available in this browser session)' : 'Copy link'} onClick={() => run(async () => { await writeAssetClipboard(asset.url, [asset.url]); setCopied(true); })}>{copied ? <Check size={16} /> : <Link size={16} strokeWidth={1.3} />}</button>
        </div>
      </header>
      <div ref={stage} className="file-gallery-stage" onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
        onClick={event => { if (imageTransition && event.target === event.currentTarget && !gesture.current) close(); }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest('video,audio') || (imageTransition && event.target === event.currentTarget)) return;
          // Capture on the original target so releasing a pan doesn't click the backdrop.
          (imageTransition ? event.target as HTMLElement : event.currentTarget).setPointerCapture(event.pointerId);
          gesture.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        }}
        onPointerMove={(event) => { if (gesture.current) setPan({ x: gesture.current.panX + event.clientX - gesture.current.x, y: gesture.current.panY + event.clientY - gesture.current.y }); }}
        onPointerUp={() => { gesture.current = undefined; }} onPointerCancel={() => { gesture.current = undefined; }}>
        <div className="file-gallery-media" style={{ width: 460 * fit * zoom, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          {asset.kind === 'image' ? <img key={asset.id} ref={picture} src={asset.url} alt={asset.name} draggable={false} /> : asset.kind === 'video' ? <video src={asset.url} controls /> : asset.kind === 'audio' ? <audio src={asset.url} controls /> : <span>{asset.name}</span>}
        </div>
      </div>
      {notice && <div className="file-gallery-message" role="status">{notice}</div>}
      {error && <div className="file-gallery-message" role="alert">{error}</div>}
      {copied && <div className="file-gallery-message" role="status">{asset.url.startsWith('blob:') ? 'Link copied · Available in this browser session' : 'Link copied'}</div>}
    </div>
    {assets.length > 1 && <aside className="file-gallery-sidebar"><div className="file-gallery-count">{index + 1} / {assets.length}</div><div className="file-gallery-thumbnails">
      {assets.map((item, itemIndex) => <button key={item.id} className={item.id === asset.id ? 'is-active' : ''} aria-label={`Image ${itemIndex + 1}`} aria-pressed={item.id === asset.id} onClick={() => onSelect(item.id)}>
        {item.kind === 'image' ? <img src={item.url} alt={item.name} draggable={false} /> : <span>{item.name}</span>}
      </button>)}
    </div></aside>}
  </div>, document.body);
}
