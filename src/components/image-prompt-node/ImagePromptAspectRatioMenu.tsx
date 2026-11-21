import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ImagePromptIcon } from './ImagePromptIcon';
import { imagePromptAspectRatioGroups, type ImagePromptAspectRatio } from './imagePromptAspectRatios';
import './image-prompt-aspect-ratio-menu.css';

interface ImagePromptAspectRatioMenuProps {
  id: string;
  labelledBy: string;
  anchor: RefObject<HTMLButtonElement>;
  value: string;
  choices?: readonly string[];
  onChange: (value: ImagePromptAspectRatio) => void;
  onClose: (restoreFocus?: boolean) => void;
}

export function ImagePromptAspectRatioMenu({ id, labelledBy, anchor, value, choices, onChange, onClose }: ImagePromptAspectRatioMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [focusedValue, setFocusedValue] = useState(value);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0, above: false });

  useLayoutEffect(() => {
    function place() {
      if (!anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const width = Math.min(224, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 12;
      const above = below < 320 && rect.top - 12 > below;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: above ? rect.top - 4 : rect.bottom + 4,
        maxHeight: Math.max(0, Math.min(320, above ? rect.top - 12 : below)),
        above,
      });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (anchor.current) observer.observe(anchor.current);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer.disconnect(); };
  }, [anchor]);

  const positioned = position.maxHeight > 0;
  useEffect(() => {
    if (!positioned) return;
    const selected = panel.current?.querySelector<HTMLButtonElement>('[aria-checked=true]');
    const first = panel.current?.querySelector<HTMLButtonElement>('[role=menuitemradio]');
    (selected ?? first)?.focus({ preventScroll: true });
    (selected ?? first)?.scrollIntoView({ block: 'nearest' });
  }, [positioned]);

  useEffect(() => {
    function outside(event: Event) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [anchor, onClose]);

  return createPortal(<div ref={panel} id={id} role="menu" aria-labelledby={labelledBy} aria-orientation="vertical" className="image-aspect-menu nodrag nopan nowheel"
    data-side={position.above ? 'top' : 'bottom'} style={{ left: position.left, top: position.top, maxHeight: position.maxHeight, visibility: positioned ? 'visible' : 'hidden' }}
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation();
        const toolbar = anchor.current?.closest('[role=toolbar]');
        const controls = [...(toolbar?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const current = anchor.current ? controls.indexOf(anchor.current) : -1;
        const next = current >= 0 ? controls[current + (event.shiftKey ? -1 : 1)] : undefined;
        onClose(!next);
        next?.focus();
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const options = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]') ?? [])];
      if (!options.length) return;
      event.preventDefault(); event.stopPropagation();
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
      options[next].focus({ preventScroll: true });
      options[next].scrollIntoView({ block: 'nearest' });
    }}>
    {imagePromptAspectRatioGroups.filter(group => group.values.some(ratio => !choices || choices.includes(ratio))).map(group => <div role="group" aria-label={group.label} key={group.label}>
      <div className="image-aspect-group-label">{group.label}</div>
      {group.values.filter(ratio => !choices || choices.includes(ratio)).map(ratio => {
        const [width, height] = ratio === 'auto' ? [1, 1] : ratio.split(':').map(Number);
        return <button key={ratio} type="button" role="menuitemradio" aria-checked={value === ratio} tabIndex={focusedValue === ratio ? 0 : -1} onFocus={() => setFocusedValue(ratio)} className="image-aspect-option"
          onClick={() => { onChange(ratio); onClose(true); }}>
          <span className="image-aspect-icon">{ratio === 'auto' ? <ImagePromptIcon name="ratio-auto" /> : <span aria-hidden="true" className="image-aspect-rectangle" style={{ transform: width >= height ? `scaleY(${height / width})` : `scaleX(${width / height})` }} />}</span>
          <span className="image-aspect-label">{ratio === 'auto' ? '自动' : ratio}</span>
          {value === ratio && <ImagePromptIcon name="check" className="image-aspect-check" />}
        </button>;
      })}
    </div>)}
  </div>, document.body);
}
