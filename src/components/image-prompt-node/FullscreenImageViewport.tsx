import { useLayoutEffect, useRef, useState } from 'react';
import { Grid3X3, Minus, Plus } from 'lucide-react';
import type { FileAsset } from '../../nodes/types';
import { FullscreenTip } from './FullscreenImageActions';

type View = { scale: number; x: number; y: number };
const clamp = (scale: number, minimum: number) => Math.max(minimum, Math.min(16, scale));

export function FullscreenImageViewport({ asset }: { asset: FileAsset }) {
  const stage = useRef<HTMLDivElement>(null);
  const imageLayer = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: asset.width ?? 0, height: asset.height ?? 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const fit = useRef(1);
  const [tiled, setTiled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; view: View }>();
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; view: View; x: number; y: number }>();
  const animation = useRef<Animation>();
  const reduced = useRef(false);
  const { width, height } = dimensions;
  useLayoutEffect(() => {
    const image = stage.current?.querySelector('img');
    const ready = Boolean(image?.complete && image.naturalWidth);
    setLoaded(ready); setFailed(Boolean(image?.complete && !image.naturalWidth));
    if (image && ready) setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    else if (asset.width && asset.height) setDimensions({ width: asset.width, height: asset.height });
  }, [asset.id, asset.url, asset.width, asset.height]);
  function change(next: View, animate = false) {
    const layer = imageLayer.current;
    const painted = layer && animate ? getComputedStyle(layer).transform : undefined;
    animation.current?.cancel();
    viewRef.current = next;
    setView(next);
    if (layer) {
      const transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
      layer.style.transform = transform;
      if (animate && !reduced.current && painted) animation.current = layer.animate([{ transform: painted }, { transform }], { duration: 100, easing: 'ease-out' });
    }
  }
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { reduced.current = media.matches; if (media.matches) animation.current?.cancel(); };
    sync(); media.addEventListener('change', sync);
    return () => { animation.current?.cancel(); media.removeEventListener('change', sync); };
  }, []);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element || !width || !height) return;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      setStageSize({ width: bounds.width, height: bounds.height });
      const wasFitted = Math.abs(viewRef.current.scale - fit.current) < .001;
      fit.current = Math.min(bounds.width / width, bounds.height / height, 1);
      if (wasFitted) {
        animation.current?.cancel();
        const next = { scale: fit.current, x: 0, y: 0 };
        viewRef.current = next; setView(next);
      } else if (viewRef.current.scale < fit.current) {
        animation.current?.cancel();
        const next = { ...viewRef.current, scale: fit.current };
        viewRef.current = next; setView(next);
      }
    };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      event.preventDefault(); event.stopPropagation();
      if (failed) return;
      const bounds = element!.getBoundingClientRect();
      let previous = viewRef.current;
      if (animation.current?.playState === 'running' && imageLayer.current) {
        const painted = new DOMMatrixReadOnly(getComputedStyle(imageLayer.current).transform);
        previous = { scale: painted.a, x: painted.e, y: painted.f };
      }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      const scale = clamp(previous.scale * Math.exp(-delta * (event.ctrlKey || event.metaKey ? .01 : .002)), fit.current);
      const ratio = scale / previous.scale;
      const x = event.clientX - bounds.left - bounds.width / 2;
      const y = event.clientY - bounds.top - bounds.height / 2;
      change({ scale, x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio });
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [failed]);
  function zoom(factor: number) { const previous = viewRef.current; change({ ...previous, scale: clamp(previous.scale * factor, fit.current) }, true); }
  function release(id: number) {
    pointers.current.delete(id); pinch.current = undefined;
    if (drag.current?.id === id) drag.current = undefined;
    if (pointers.current.size === 1) {
      const [remainingId, point] = [...pointers.current.entries()][0];
      drag.current = { id: remainingId, ...point, view: viewRef.current };
    }
    const element = stage.current;
    if (element?.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  const tiles = (span: number, dimension: number, offset: number) => Math.max(3, Math.ceil((span + 2 * Math.abs(offset)) / Math.max(1, dimension * view.scale)) + 2) | 1;
  return <div className="image-fullscreen-stage" ref={stage} data-dragging={Boolean(drag.current) || undefined} data-unavailable={failed || undefined}
    onPointerDown={event => {
      if (failed || event.button !== 0 || (event.target as Element).closest('button')) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (animation.current?.playState === 'running' && imageLayer.current) {
        const painted = new DOMMatrixReadOnly(getComputedStyle(imageLayer.current).transform);
        change({ scale: painted.a, x: painted.e, y: painted.f });
      } else animation.current?.cancel();
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { distance: Math.hypot(b.x - a.x, b.y - a.y), view: viewRef.current, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        drag.current = undefined;
      } else drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view: viewRef.current };
    }}
    onPointerMove={event => {
      if (failed || !pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()]; const initial = pinch.current;
        const scale = clamp(initial.view.scale * Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, initial.distance), fit.current);
        const bounds = event.currentTarget.getBoundingClientRect(); const ratio = scale / initial.view.scale;
        const x = initial.x - bounds.left - bounds.width / 2; const y = initial.y - bounds.top - bounds.height / 2;
        change({ scale, x: x - (x - initial.view.x) * ratio + (a.x + b.x) / 2 - initial.x, y: y - (y - initial.view.y) * ratio + (a.y + b.y) / 2 - initial.y });
      } else if (drag.current?.id === event.pointerId) {
        const start = drag.current; change({ ...start.view, x: start.view.x + event.clientX - start.x, y: start.view.y + event.clientY - start.y });
      }
    }} onPointerUp={event => release(event.pointerId)} onPointerCancel={event => release(event.pointerId)} onLostPointerCapture={event => { pointers.current.delete(event.pointerId); if (drag.current?.id === event.pointerId) drag.current = undefined; if (pointers.current.size < 2) pinch.current = undefined; }}>
    <div className="image-fullscreen-image-center">
      <div ref={imageLayer} className="image-fullscreen-image-transform" style={{ width: tiled ? width * tiles(stageSize.width, width, view.x) : width, height: tiled ? height * tiles(stageSize.height, height, view.y) : height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {tiled && <div className="image-fullscreen-tiled" aria-label="Tiled image" style={{ backgroundImage: `url("${asset.url}")`, backgroundSize: `${width}px ${height}px` }} />}
        <img src={asset.url} alt="Full screen preview" draggable={false} data-loaded={loaded && !failed || undefined} style={{ width, height, display: tiled || failed ? 'none' : undefined }}
          onLoad={event => { const image = event.currentTarget; setDimensions({ width: image.naturalWidth, height: image.naturalHeight }); setFailed(false); setLoaded(true); }} onError={() => setFailed(true)} />
      </div>
    </div>
    {failed && <span className="image-fullscreen-unavailable">Asset unavailable</span>}
    {!failed && <div className="image-fullscreen-zoom">
      <FullscreenTip label={tiled ? 'Show single image' : 'Tile image'}><button type="button" aria-label={tiled ? 'Show single image' : 'Tile image'} aria-pressed={tiled} onClick={() => setTiled(!tiled)}><Grid3X3 /></button></FullscreenTip>
      <FullscreenTip label="Zoom out"><button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}><Minus /></button></FullscreenTip>
      <FullscreenTip label="Reset view"><button type="button" aria-label="Reset view" className="image-fullscreen-zoom-value" onClick={() => change({ scale: Math.abs(viewRef.current.scale - fit.current) < .001 && Math.abs(viewRef.current.x) < 1 && Math.abs(viewRef.current.y) < 1 ? 1 : fit.current, x: 0, y: 0 }, true)}>{Math.round(view.scale * 100)}%</button></FullscreenTip>
      <FullscreenTip label="Zoom in"><button type="button" aria-label="Zoom in" onClick={() => zoom(1.5)}><Plus /></button></FullscreenTip>
    </div>}
  </div>;
}
