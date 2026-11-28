import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GalleryThumbnails, LayoutDashboard, Download, SquarePen, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { FileAsset } from '../../nodes/types';
import { assetResources } from '../../nodes/assetResources';
import { savedImagePrompt } from '../../nodes/generationRecord';
import { downloadAssets, downloadImageAsset } from '../../nodes/fileMedia';
import type { ImageDownloadFormat } from '../../nodes/fileMedia';
import { FullscreenImageViewport } from './FullscreenImageViewport';
import { FullscreenImageInformation } from './FullscreenImageInformation';
import { FullscreenDownloadMenu, FullscreenCopyButton, FullscreenTip, FullscreenTooltipScope } from './FullscreenImageActions';
import { ScrollArea } from '../ui/scroll-area';
import './image-asset-preview.css';

function FullscreenHistoryImage({ asset }: { asset: FileAsset }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="image-fullscreen-thumbnail-unavailable"><span /></div>
    : <img src={asset.url} alt={savedImagePrompt(asset) ?? asset.name} draggable={false} onError={() => setFailed(true)} />;
}

/** Browsing fullscreen history is view-only; canvas output and undo stay untouched. */
export function ImageAssetPreview({ asset, assets, onClose }: { asset: FileAsset; assets?: readonly FileAsset[]; onClose: () => void }) {
  const variants = assets?.length ? assets : [asset];
  const [selectedId, setSelectedId] = useState(asset.id);
  const index = Math.max(0, variants.findIndex(item => item.id === selectedId));
  const current = variants[index];
  const [masonry, setMasonry] = useState(false);
  const gallery = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const thumbnails = useRef<HTMLDivElement>(null);
  const thumbnailAnimations = useRef(new Map<HTMLButtonElement, Animation>());
  const previousThumbnailIndex = useRef(index);
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = thumbnailAnimations.current;
    const stop = () => { for (const animation of animations.values()) animation.cancel(); animations.clear(); };
    const sync = () => { if (media.matches) stop(); };
    media.addEventListener('change', sync);
    return () => { stop(); media.removeEventListener('change', sync); };
  }, []);
  useLayoutEffect(() => {
    const previous = previousThumbnailIndex.current;
    previousThumbnailIndex.current = index;
    if (previous === index) return;
    const animations = thumbnailAnimations.current;
    // Read every interrupted size before cancelling; a reversal always gets the
    // reference's full 250ms tween starting at the currently painted frame.
    const sizes = [...(thumbnails.current?.querySelectorAll('button') ?? [])].map((button, i) => ({
      button, from: animations.get(button)?.playState === 'running' ? parseFloat(getComputedStyle(button).width) : i === previous ? 72 : 60,
      to: i === index ? 72 : 60,
    }));
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const { button, from, to } of sizes) if (from !== to) {
      animations.set(button, button.animate([{ width: `${from}px`, height: `${from}px` }, { width: `${to}px`, height: `${to}px` }], { duration: 250, easing: 'cubic-bezier(.4, 0, .2, 1)' }));
    }
  }, [index]);
  useLayoutEffect(() => {
    const element = gallery.current;
    if (!element) return;
    const resize = () => {
      const style = getComputedStyle(element);
      const contentWidth = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setColumns(Math.max(1, Math.floor((contentWidth + 16) / 216)));
    };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const downloadInFlight = useRef(false);
  const [portal, setPortal] = useState<HTMLDialogElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [restoreFocus] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const prompt = savedImagePrompt(current);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    setPortal(element);
    return () => {
      clearTimeout(closeTimer.current);
      restoreFocus?.focus({ preventScroll: true });
    };
  }, [restoreFocus]);
  useLayoutEffect(() => {
    if (masonry) return;
    // A closed native dialog has no layout. Reveal the initial selection only
    // after showModal(), including when opening a saved item far down history.
    thumbnails.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.scrollIntoView({
      block: 'center', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [index, masonry]);
  const urls = variants.map(item => item.url).join('\n');
  useLayoutEffect(() => assetResources.retain(urls.split('\n')), [urls]);
  function close() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => dialog.current?.close(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150);
  }
  function select(next: number) {
    if (variants[next]) setSelectedId(variants[next].id);
  }
  async function download(value: FileAsset, format: ImageDownloadFormat) {
    try { await downloadImageAsset(value, format); } catch { setError('图片下载失败。'); }
  }
  async function downloadAll() {
    if (downloadInFlight.current) return;
    downloadInFlight.current = true; setDownloading(true); setError('');
    try { await downloadAssets([...variants]); } catch { setError('图片下载失败，请重试。'); }
    finally { downloadInFlight.current = false; setDownloading(false); }
  }
  return createPortal(<FullscreenTooltipScope portal={portal}><dialog ref={dialog} className="image-fullscreen nodrag nopan nowheel" aria-label="Preview" data-closing={closing || undefined}
    onClose={onClose} onCancel={event => { event.preventDefault(); close(); }}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Tab' && !(event.target as Element).closest('[role="menu"]')) {
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]')].filter(element =>
          element.tabIndex >= 0 && !element.closest('[inert], [aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0);
        const last = controls[controls.length - 1];
        const destination = event.shiftKey && document.activeElement === controls[0] ? last
          : !event.shiftKey && document.activeElement === last ? controls[0] : undefined;
        if (destination) { event.preventDefault(); destination.focus(); }
      }
      if (event.key === 'Escape' && !(event.target as Element).closest('[role="menu"]')) { event.preventDefault(); close(); return; }
      if ((event.target as Element).closest('[role="menu"], [role="radiogroup"], [role="listbox"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); select(index + (event.key === 'ArrowLeft' ? -1 : 1)); }
    }}>
    <div className="image-fullscreen-overlay" onClick={close} />
    <div className="image-fullscreen-shell">
      <aside className="image-fullscreen-history" data-hidden={masonry || variants.length < 2 || undefined} ref={element => { if (element) element.inert = masonry; }} aria-hidden={masonry || undefined}>
        {variants.length > 1 && <div ref={thumbnails} role="listbox" tabIndex={-1} aria-label="Generation variants" className="image-fullscreen-variants"
          onKeyDown={event => {
            const next = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? index + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? variants.length - 1 : -1;
            if (next >= 0 && next < variants.length) { event.preventDefault(); select(next); event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus(); }
          }}>
          {variants.map((item, i) => <button type="button" role="option" aria-selected={i === index} tabIndex={i === index ? 0 : -1}
            aria-label={`Variant ${variants.length - i} of ${variants.length}`} key={item.id} onClick={() => select(i)}>
            <FullscreenHistoryImage key={`${item.id}:${item.url}`} asset={item} />
          </button>)}
        </div>}
      </aside>
      <div className="image-fullscreen-main">
        <div className="image-fullscreen-toolbar-position">
          <div role="toolbar" aria-label="Fullscreen controls" className="image-fullscreen-toolbar">
            <div role="radiogroup" aria-label="Fullscreen layout" className="image-fullscreen-layout" onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault(); const value = event.key === 'End' || (event.key !== 'Home' && !masonry); setMasonry(value);
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[value ? 1 : 0]?.focus();
              }
            }}>
              <FullscreenTip label="Single view"><button type="button" role="radio" aria-checked={!masonry} tabIndex={masonry ? -1 : 0} aria-label="Single view" onClick={() => setMasonry(false)}><GalleryThumbnails className="image-fullscreen-single-icon" /></button></FullscreenTip>
              <FullscreenTip label="Masonry view"><button type="button" role="radio" aria-checked={masonry} tabIndex={masonry ? 0 : -1} aria-label="Masonry view" onClick={() => setMasonry(true)}><LayoutDashboard /></button></FullscreenTip>
            </div>
            <span role="separator" />
            {masonry ? <button className="image-fullscreen-download-all" type="button" disabled={downloading} aria-busy={downloading} aria-label="Download all" onClick={() => void downloadAll()}><Download />Download all</button> : <>
              <FullscreenDownloadMenu portal={portal} batch={variants.length > 1} onDownload={format => void download(current, format)} onDownloadAll={() => void downloadAll()} downloading={downloading} />
              <FullscreenTip label="Edit"><button type="button" aria-label="Edit" aria-disabled="true"><SquarePen className="image-fullscreen-edit-icon" /></button></FullscreenTip>
              {variants.length > 1 && <><span role="separator" /><div className="image-fullscreen-pagination">
                <button type="button" aria-label="View previous" disabled={index === 0} onClick={() => select(index - 1)}><ChevronLeft /></button>
                <span>{index + 1} of {variants.length}</span>
                <button type="button" aria-label="View next" disabled={index === variants.length - 1} onClick={() => select(index + 1)}><ChevronRight /></button>
              </div></>}
            </>}
          </div>
        </div>
        <div className="image-fullscreen-content">
        <ScrollArea className="image-fullscreen-masonry image-fullscreen-layout-panel" viewportRef={gallery} viewportClassName="image-fullscreen-masonry-viewport" data-hidden={!masonry || undefined} aria-hidden={!masonry || undefined} aria-label="Generation gallery" {...(!masonry ? { inert: '' } : {})}><div className="image-fullscreen-masonry-columns">
          {Array.from({ length: columns }, (_, column) => <div className="image-fullscreen-masonry-column" key={column}>{variants.map((item, i) => i % columns !== column ? null : <div className="image-fullscreen-masonry-item" key={item.id}
            onClick={() => { select(i); setMasonry(false); }}>
            <button type="button" className="image-fullscreen-masonry-open" aria-label={`Open variant ${i + 1}`}><img src={item.url} alt="Generated media" draggable={false} /></button>
            <div className="image-fullscreen-masonry-overlay"><ScrollArea className="image-fullscreen-masonry-prompt" viewportClassName="image-fullscreen-masonry-prompt-viewport"><p>{savedImagePrompt(item)}</p></ScrollArea><div onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
              <FullscreenCopyButton value={savedImagePrompt(item) ?? ''} label="Copy prompt" />
              <FullscreenDownloadMenu portal={portal} label="Download media" onDownload={format => void download(item, format)} />
            </div></div>
          </div>)}</div>)}
        </div></ScrollArea>
        <div className="image-fullscreen-single-panel image-fullscreen-layout-panel" data-hidden={masonry || undefined} aria-hidden={masonry || undefined} {...(masonry ? { inert: '' } : {})}>
          <div className="image-fullscreen-body">
            <div className="image-fullscreen-image-column"><FullscreenImageViewport asset={current} /></div>
            <FullscreenImageInformation key={`${current.id}:${current.url}`} asset={current} />
          </div>
          {prompt && <div className="image-fullscreen-footer"><div className="image-fullscreen-prompt-column"><div className="image-fullscreen-prompt"><ScrollArea className="image-fullscreen-prompt-scroll" viewportClassName="image-fullscreen-prompt-viewport">{prompt}</ScrollArea><FullscreenCopyButton value={prompt} label="Copy prompt" /></div></div><div className="image-fullscreen-footer-spacer" /></div>}
        </div>
        </div>
      </div>
    </div>
    <FullscreenTip label="Close fullscreen"><button type="button" className="image-fullscreen-close" aria-label="Close fullscreen" onClick={close}><X /></button></FullscreenTip>
    {error && <button type="button" role="alert" className="image-fullscreen-error" onClick={() => setError('')}>{error}</button>}
  </dialog></FullscreenTooltipScope>, document.body);
}
