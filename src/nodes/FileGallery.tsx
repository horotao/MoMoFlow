import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Check } from 'lucide-react';
import { assetResources, writeAssetClipboard } from './assetResources';
import { FileIcon } from './FileIcon';
import { FileActionMenu } from './FileActionMenu';
import { copyAssetImage, downloadAsset, downloadAssets } from './fileMedia';
import type { FileAsset } from './types';

type Props = { assets: FileAsset[]; activeId: string; onSelect: (id: string) => void; onClose: () => void };
export function FileGallery({ assets, activeId, onSelect, onClose }: Props) {
  useLayoutEffect(() => assetResources.retain(assets.map(asset => asset.url)), [assets]);
  const index = Math.max(0, assets.findIndex((item) => item.id === activeId));
  const asset = assets[index];
  const panel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
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
    observer.observe(stage.current!);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => { observer.disconnect(); previous?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setError(''); setCopied(false); setNotice(''); }, [asset.id]);
  useEffect(() => {
    const element = stage.current!;
    const wheel = (event: WheelEvent) => { event.preventDefault(); setZoom((value) => Math.min(12, Math.max(.1, value * Math.exp(-event.deltaY * .002)))); };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const run = (action: () => Promise<void>, success = '') => { setError(''); setNotice(''); setCopied(false); void action().then(() => setNotice(success)).catch((error: unknown) => setError(error instanceof Error ? error.message : 'This action could not be completed.')); };
  return createPortal(<div ref={panel} className="file-gallery nodrag nopan nowheel" role="dialog" aria-modal="true" aria-label="File image viewer" tabIndex={-1}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.target instanceof HTMLElement && event.target.closest('[role="menu"]')) return;
      if (event.key === 'Escape') onClose();
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
    <div className="file-gallery-main">
      <header className="file-gallery-header">
        <div className="file-gallery-title"><button className="file-icon-button" aria-label="Close" title="Close (Esc)" onClick={onClose}><FileIcon name="close" /></button><span>File</span></div>
        <div className="file-gallery-tools">
          <span className="file-gallery-zoom" title="Scroll to zoom · Double-click to reset">{Math.round(fit * zoom * 100)}%</span><span className="file-gallery-divider" />
          <FileActionMenu label="Download" items={[
            { label: 'Download', action: () => run(() => downloadAsset(asset)) },
            ...(assets.length > 1 ? [{ label: 'Download all', action: () => run(() => downloadAssets(assets)) }] : []),
            ...(asset.kind === 'image' ? [{ label: 'Copy image', action: () => run(() => copyAssetImage(asset), 'Image copied') }] : []),
          ]}><FileIcon name="download" /></FileActionMenu>
          <button className="file-icon-button" aria-label="Copy link" title={asset.url.startsWith('blob:') ? 'Copy link (available in this browser session)' : 'Copy link'} onClick={() => run(async () => { await writeAssetClipboard(asset.url, [asset.url]); setCopied(true); })}>{copied ? <Check size={16} /> : <Link size={16} strokeWidth={1.3} />}</button>
        </div>
      </header>
      <div ref={stage} className="file-gallery-stage" onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
        onPointerDown={(event) => { if (event.button !== 0 || (event.target as HTMLElement).closest('video,audio')) return; event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; }}
        onPointerMove={(event) => { if (gesture.current) setPan({ x: gesture.current.panX + event.clientX - gesture.current.x, y: gesture.current.panY + event.clientY - gesture.current.y }); }}
        onPointerUp={() => { gesture.current = undefined; }} onPointerCancel={() => { gesture.current = undefined; }}>
        <div className="file-gallery-media" style={{ width: 460 * fit * zoom, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          {asset.kind === 'image' ? <img src={asset.url} alt={asset.name} draggable={false} /> : asset.kind === 'video' ? <video src={asset.url} controls /> : asset.kind === 'audio' ? <audio src={asset.url} controls /> : <span>{asset.name}</span>}
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
