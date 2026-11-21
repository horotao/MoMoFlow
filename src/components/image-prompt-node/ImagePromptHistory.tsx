import { Component, createRef, useRef, useState, type ReactNode } from 'react';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-prompt-history.css';

export interface ImagePromptVariant {
  id: string | number;
  thumbnail?: ReactNode;
  pending?: boolean;
}

interface ProjectionProps {
  layoutKey: string;
  beforeProjection: () => void;
  children: ReactNode;
}
interface LayoutSnapshot {
  items: Map<HTMLButtonElement, DOMRect>;
  viewport: DOMRect | null;
}

// Like the reference carousel, commit the final layout once and project its
// buttons from their previous painted bounds. Reversals start at the current
// frame; width and margin are never animated on every frame.
class HistoryProjection extends Component<ProjectionProps> {
  private row = createRef<HTMLDivElement>();
  private animations: Animation[] = [];
  private restoreClip: (() => void) | undefined;
  private reducedMotion: MediaQueryList | null = null;

  componentDidMount() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.addEventListener('change', this.onMotionChange);
    this.props.beforeProjection();
  }

  getSnapshotBeforeUpdate(previous: ProjectionProps) {
    if (previous.layoutKey === this.props.layoutKey || !this.row.current) return null;
    return {
      items: new Map(Array.from(this.row.current.querySelectorAll('button'), item => [item, item.getBoundingClientRect()])),
      viewport: this.row.current.querySelector('.image-node-variant-viewport')?.getBoundingClientRect() ?? null,
    };
  }

  componentDidUpdate(_previous: ProjectionProps, _state: unknown, snapshot: LayoutSnapshot | null) {
    if (!snapshot) return;
    this.stop();
    this.props.beforeProjection();
    const row = this.row.current;
    if (!row || this.reducedMotion?.matches) return;
    const scale = row.getBoundingClientRect().width / row.offsetWidth;
    if (!Number.isFinite(scale) || scale <= 0) return;
    const projections: { item: HTMLButtonElement; transform: string }[] = [];
    for (const [item, previous] of snapshot.items) {
      if (!row.contains(item)) continue;
      const next = item.getBoundingClientRect();
      if (!previous.width || !next.width || !previous.height || !next.height) continue;
      const x = (previous.left - next.left + (previous.width - next.width) / 2) / scale;
      const y = (previous.top - next.top + (previous.height - next.height) / 2) / scale;
      const sx = previous.width / next.width;
      const sy = previous.height / next.height;
      if (x || y || sx !== 1 || sy !== 1) projections.push({ item, transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})` });
    }
    const viewport = row.querySelector<HTMLElement>('.image-node-variant-viewport');
    // Measure the final, untransformed layout first. Starting the animations
    // here would inflate scrollWidth and incorrectly skip the clip protection.
    if (projections.length && viewport && snapshot.viewport && viewport.scrollWidth <= viewport.clientWidth) {
      const next = viewport.getBoundingClientRect();
      const left = Math.min(0, (snapshot.viewport.left - next.left) / scale);
      const right = Math.min(0, (next.right - snapshot.viewport.right) / scale);
      if (left || right) {
        const { overflow, clipPath } = viewport.style;
        viewport.style.overflow = 'visible';
        viewport.style.clipPath = `inset(0px ${right}px 0px ${left}px)`;
        this.restoreClip = () => { viewport.style.overflow = overflow; viewport.style.clipPath = clipPath; };
      }
    }
    const animations = projections.map(({ item, transform }) => item.animate([
      { transform },
      { transform: 'none' },
    ], { duration: 250, easing: 'cubic-bezier(.4, 0, .2, 1)' }));
    this.animations = animations;
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (this.animations === animations) this.stop();
    });
  }

  componentWillUnmount() {
    this.stop();
    this.reducedMotion?.removeEventListener('change', this.onMotionChange);
  }

  private onMotionChange = () => { if (this.reducedMotion?.matches) this.stop(); };
  private stop() {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    this.restoreClip?.();
    this.restoreClip = undefined;
  }

  render() { return <div ref={this.row} className="image-node-variant-row">{this.props.children}</div>; }
}

export function ImagePromptHistory({ variants, activeVariant, onVariantChange }: {
  variants: readonly ImagePromptVariant[];
  activeVariant: number;
  onVariantChange?: (index: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const expanded = hovered || focused || variants.some(variant => variant.pending);

  function centerActive() {
    const scroller = viewport.current;
    const active = scroller?.querySelector<HTMLElement>('[aria-pressed=true]');
    if (!scroller || !active) return;
    const target = active.offsetLeft - scroller.clientWidth / 2 + active.offsetWidth / 2;
    scroller.scrollLeft = Math.max(0, Math.min(target, scroller.scrollWidth - scroller.clientWidth));
  }

  if (variants.length < 2) return null;

  return <div className="image-node-variants" data-expanded={expanded}
    onPointerEnter={event => {
      if (event.pointerType !== 'touch' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) setHovered(true);
    }}
    onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => {
      let index: number;
      if (event.key === 'ArrowLeft') index = (activeVariant - 1 + variants.length) % variants.length;
      else if (event.key === 'ArrowRight') index = (activeVariant + 1) % variants.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = variants.length - 1;
      else return;
      event.preventDefault();
      event.stopPropagation();
      onVariantChange?.(index);
    }}>
    <div className="image-node-variant-carousel" aria-label="Generation history carousel" tabIndex={0}>
      <HistoryProjection layoutKey={`${expanded}:${activeVariant}:${variants.map(variant => variant.id).join(',')}`} beforeProjection={centerActive}>
        <button type="button" aria-label="Previous variant" tabIndex={-1} disabled={activeVariant <= 0} onClick={() => onVariantChange?.(activeVariant - 1)}><ImagePromptIcon name="chevron" /></button>
        <div ref={viewport} className={`image-node-variant-viewport${expanded ? ' nowheel' : ''}`} onWheel={event => {
          if (expanded && event.currentTarget.scrollWidth > event.currentTarget.clientWidth) {
            event.stopPropagation();
            if (event.deltaY && !event.deltaX) event.currentTarget.scrollLeft += event.deltaY;
          }
        }}>
          <div className="image-node-variant-thumbnails">{variants.map((variant, index) => <button key={variant.id} type="button" style={{ zIndex: index + 1 }} aria-label={`Variant ${index + 1} of ${variants.length}`} aria-pressed={index === activeVariant} onClick={() => onVariantChange?.(index)}>{variant.thumbnail}</button>)}</div>
        </div>
        <button type="button" aria-label="Next variant" tabIndex={-1} disabled={activeVariant >= variants.length - 1} onClick={() => onVariantChange?.(activeVariant + 1)}><ImagePromptIcon name="chevron" /></button>
      </HistoryProjection>
    </div>
    <span>{activeVariant + 1} of {variants.length}</span>
  </div>;
}
