import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { describerModels } from '../nodes/describer';
import { DescriberIcon } from './DescriberIcon';
import { pickNearest, useFluidHover, useRegisterFluidHoverItem, type UseFluidHoverReturn } from '../hooks/use-fluid-hover';
import { FluidHoverHighlight } from './fluid-hover-highlight';

const noSeparators: readonly number[] = [];
const settingsOptionHeight = 24;

function SelectOption({ id, index, selected, active, separator, label, checkIcon, checkText, registerItem, onPointerMove, onChoose }: {
  id: string; index: number; selected: boolean; active: boolean; separator: boolean; label: string;
  checkIcon?: string;
  checkText?: string;
  registerItem?: UseFluidHoverReturn['registerItem']; onPointerMove?: () => void; onChoose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useRegisterFluidHoverItem(registerItem, index, ref);
  return <div ref={ref} id={id} role="option" aria-selected={selected}
    className={`${active ? 'is-active' : ''}${separator ? ' has-separator' : ''}`}
    onPointerMove={onPointerMove} onMouseDown={event => event.preventDefault()} onClick={onChoose}>
    <span className="describer-model-check">{selected && (checkText ?? (checkIcon ? <img src={checkIcon} width={10.25} height={7.25} alt="" /> : <DescriberIcon name="check" />))}</span>{label}
  </div>;
}

export function DescriberModelSelect({ value, disabled, onChange, choices = describerModels, node = false, compact = false, appearance = 'default', fluidHover = false, label = 'Model', labels, includeCurrentValue = true, menuLabel, separators = noSeparators }: {
  appearance?: 'default' | 'levels' | 'blend' | 'compare' | 'settings';
  separators?: readonly number[]; value: string; choices?: readonly string[]; node?: boolean; compact?: boolean; fluidHover?: boolean; label?: string; labels?: readonly string[]; disabled?: boolean; includeCurrentValue?: boolean; menuLabel?: string; onChange: (model: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const hover = useFluidHover(list, { axis: 'y' });
  const [placement, setPlacement] = useState<{ left: number; top: number; height: number; width: number } | null>(null);
  const [active, setActive] = useState(0);
  const activeIndex = fluidHover ? hover.activeIndex ?? active : active;
  const options = useMemo(() => !includeCurrentValue || choices.includes(value) ? choices : [value, ...choices], [value, choices, includeCurrentValue]);
  const activate = (index: number) => {
    // Keyboard navigation cancels a queued pointer frame before taking over.
    pointer.current = null;
    hover.handlers.onMouseLeave();
    hover.setActiveIndex(index);
    setActive(index);
  };
  const close = () => { pointer.current = null; hover.handlers.onMouseLeave(); setPlacement(null); trigger.current?.focus(); };
  const open = () => {
    if (disabled) return;
    const rect = trigger.current!.getBoundingClientRect();
    const index = Math.max(0, options.indexOf(value));
    const height = Math.min(node || compact ? options.length * 24 + separators.length * 16 + 16 : 410, window.innerHeight - 24, rect.top - 12 + (options.length - index) * 24 + 8);
    const top = Math.max(12, Math.min(rect.top - index * 24 - separators.filter(n => n <= index).length * 16 - 8, window.innerHeight - height - 12));
    activate(index);
    if (appearance === 'settings') {
      const height = Math.min(options.length * settingsOptionHeight + 16, 324, window.innerHeight - 16);
      const width = Math.min(rect.width + 16, window.innerWidth - 16);
      const top = Math.max(8, Math.min(rect.top - index * settingsOptionHeight - 8, window.innerHeight - height - 8));
      setPlacement({ width, height, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - width - 8)), top });
      return;
    }
    if (appearance === 'blend' || appearance === 'compare') {
      const height = Math.min(options.length * 28 + separators.length * 9 + 16, 320, window.innerHeight - 24);
      const width = Math.min(appearance === 'compare' ? 152 : 176, window.innerWidth - 24);
      const top = rect.bottom + 4 + height <= window.innerHeight - 12 ? rect.bottom + 4 : rect.top - height - 4;
      setPlacement({ width, height, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(top, window.innerHeight - height - 12)) });
      return;
    }
    if (appearance === 'levels') {
      const height = options.length * 28 + 16;
      const width = Math.min(Math.max(rect.width, trigger.current!.offsetWidth), window.innerWidth - 16);
      setPlacement({ width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: rect.bottom + 4 + height <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), height });
      return;
    }
    if (compact) {
      // The portal keeps screen-sized text while the canvas scales its trigger.
      // Preserve the unscaled control width so zooming out cannot clip options.
      const width = Math.min(Math.max(rect.width, trigger.current!.offsetWidth) + 16, window.innerWidth - 16);
      setPlacement({ width, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - width - 8)), top, height });
      return;
    }
    setPlacement({ width: node ? Math.max(220, rect.width + 16) : 220, left: Math.max(12, Math.min(rect.left - (node ? 8 : 37), window.innerWidth - (node ? Math.max(220, rect.width + 16) : 220) - 12)), top, height });
  };
  useLayoutEffect(() => {
    if (!placement || !list.current || !trigger.current) return;
    if (appearance === 'blend' || appearance === 'compare') {
      const index = Math.max(0, options.indexOf(value));
      const offset = index * 28 + separators.filter(n => n <= index).length * 9;
      list.current.scrollTop = Math.max(0, offset - (placement.height - 28) / 2);
    } else if (appearance !== 'levels') list.current.scrollTop = Math.max(0, options.indexOf(value) * (appearance === 'settings' ? settingsOptionHeight : 24) + separators.filter(n => n <= options.indexOf(value)).length * 16 - (trigger.current.getBoundingClientRect().top - placement.top - 8));
    list.current.focus();
  }, [placement, value, options, separators, appearance]);
  useEffect(() => {
    if (!placement) return;
    const dismiss = (event: PointerEvent) => {
      if (!list.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPlacement(null);
    };
    const resize = () => setPlacement(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', resize); };
  }, [placement]);
  return <>
    <button id={node || compact ? id + "-trigger" : "describer-model"} ref={trigger} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={Boolean(placement)} aria-controls={placement ? id : undefined} disabled={disabled} className="describer-model-trigger nodrag nopan" onClick={() => placement ? close() : open()} onKeyDown={(e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    }}><span>{labels?.[choices.indexOf(value)] ?? (value || 'Select an option')}</span>{appearance === 'settings' ? <img src="/gpt-sidebar/chevron.svg" width={20} height={20} alt="" /> : appearance !== 'default' ? <img src={`/${appearance === 'levels' ? 'levels-node' : 'blend-node'}/chevron.svg`} width={12} height={12} alt="" /> : <DescriberIcon name="chevron" />}</button>
    {placement && !disabled && createPortal(<div ref={list} id={id} role="listbox" aria-label={menuLabel ?? (compact || label !== 'Model' ? label : "Models")} aria-activedescendant={options[activeIndex] !== undefined ? `${id}-${activeIndex}` : undefined} tabIndex={-1} className={`describer-model-menu nodrag nopan nowheel${fluidHover ? ' describer-model-menu-fluid' : ''}${appearance === 'levels' ? ' levels-channel-menu' : ''}${appearance === 'blend' ? ' blend-mode-menu' : ''}${appearance === 'compare' ? ' compare-mode-menu' : ''}${appearance === 'settings' ? ' node-settings-menu sunburst-parameter-menu' : ''}`} style={placement}
      {...(fluidHover ? hover.handlers : {})}
      onMouseMove={fluidHover ? event => {
        pointer.current = { x: event.clientX, y: event.clientY };
        hover.handlers.onMouseMove(event);
      } : undefined}
      onMouseLeave={fluidHover ? () => { pointer.current = null; hover.handlers.onMouseLeave(); } : undefined}
      onScroll={fluidHover ? () => {
        // Scrolling can put another option under a stationary pointer.
        const container = list.current;
        if (!pointer.current || !container || !hover.isMeasured) return;
        hover.setActiveIndex(pickNearest({
          axis: 'y', point: pointer.current, rects: hover.itemRects,
          containerRect: container.getBoundingClientRect(),
          scroll: { x: container.scrollLeft, y: container.scrollTop },
          border: { x: container.clientLeft, y: container.clientTop },
          layoutSize: { width: container.offsetWidth, height: container.offsetHeight },
        }));
      } : undefined}
      onKeyDown={(e) => {
      e.stopPropagation();
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[activeIndex] !== undefined) onChange(options[activeIndex]); close(); return; }
      let next = activeIndex;
      if (e.key === 'ArrowDown') next = Math.min(options.length - 1, activeIndex + 1);
      else if (e.key === 'ArrowUp') next = Math.max(0, activeIndex - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = options.length - 1;
      else return;
      e.preventDefault(); activate(next);
      list.current?.querySelectorAll('[role="option"]')[next]?.scrollIntoView({ block: 'nearest' });
    }}>
      {fluidHover && <FluidHoverHighlight hover={hover} className="describer-model-hover" />}
      {options.map((model, index) => <SelectOption key={model} id={`${id}-${index}`} index={index}
        selected={model === value} active={index === activeIndex} checkIcon={appearance === 'levels' || appearance === 'blend' ? '/levels-node/check.svg' : undefined} checkText={appearance === 'compare' ? '✓' : undefined} separator={separators.includes(index)}
        label={labels?.[choices.indexOf(model)] ?? model} registerItem={fluidHover ? hover.registerItem : undefined}
        onPointerMove={fluidHover ? undefined : () => setActive(index)} onChoose={() => { onChange(model); close(); }} />)}
    </div>, document.body)}
  </>;
}
