import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DescriberIcon } from './DescriberIcon';

// Shared surface and spring from the beUI Morph Select.
// https://beui.dev/components/motion/select
const morph = { type: 'spring', duration: 0.5, bounce: 0.22 } as const;
const openMorph = { ...morph, duration: 0.35 };
const surfaceRadius = 8;
const optionHeight = 24;
const listPadding = 8;
const panelInset = 8;

type Placement = {
  host: HTMLElement;
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxListHeight: number;
};

export function SettingsMorphSelect({ value, choices, labels, label = 'Model', menuLabel, disabled, includeCurrentValue = true, onChange }: {
  value: string; choices: readonly string[]; labels?: readonly string[]; label?: string; menuLabel?: string;
  disabled?: boolean; includeCurrentValue?: boolean; onChange: (value: string) => void;
}) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ query: '', time: 0 });
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState(0);
  const options = !includeCurrentValue || choices.includes(value) ? choices : [value, ...choices];
  const labelFor = (option: string) => labels?.[choices.indexOf(option)] ?? option;
  const currentLabel = labelFor(value) || 'Select an option';
  const open = Boolean(placement && !disabled);
  const layoutId = reduceMotion ? undefined : id;

  const close = () => {
    setPlacement(null);
    trigger.current?.focus({ preventScroll: true });
  };

  const show = () => {
    const button = trigger.current;
    const host = button?.closest<HTMLElement>('.node-settings-panel');
    if (disabled || !button || !host || !options.length) return;
    const rect = button.getBoundingClientRect();
    const bounds = host.getBoundingClientRect();
    const below = bounds.bottom - rect.top - panelInset;
    const above = rect.bottom - bounds.top - panelInset;
    const desiredHeight = Math.min(options.length * optionHeight + listPadding, 244);
    const opensAbove = below < desiredHeight && above > below;
    typeahead.current = { query: '', time: 0 };
    setActive(Math.max(0, options.indexOf(value)));
    // Position against the sidebar so the menu can extend past the scrolling fields.
    setPlacement({
      host,
      left: rect.left - bounds.left,
      top: opensAbove ? undefined : rect.top - bounds.top,
      bottom: opensAbove ? bounds.bottom - rect.bottom : undefined,
      width: rect.width,
      maxListHeight: Math.max(0, Math.min(desiredHeight, opensAbove ? above : below)),
    });
  };

  useLayoutEffect(() => {
    if (open) list.current?.focus({ preventScroll: true });
  }, [open]);

  useLayoutEffect(() => {
    const container = list.current;
    const option = container?.children[active] as HTMLElement | undefined;
    if (!open || !container || !option) return;
    // Keep keyboard focus visible without scrolling the sidebar behind the popup.
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }, [active, open]);

  useEffect(() => {
    if (disabled) setPlacement(null);
  }, [disabled]);

  useEffect(() => {
    if (!open || !placement) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPlacement(null);
    };
    const scroller = placement.host.querySelector('.node-settings-fields');
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('resize', close);
    scroller?.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('resize', close);
      scroller?.removeEventListener('scroll', close);
    };
  }, [open, placement]);

  const choose = (option: string) => {
    if (!open) return;
    close();
    onChange(option);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    const { key } = event;
    if (key === 'Tab' || key === 'Escape') {
      if (key === 'Escape') event.preventDefault();
      close();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (options[active] !== undefined) choose(options[active]);
      return;
    }
    let next = active;
    if (key === 'ArrowDown') next = Math.min(options.length - 1, active + 1);
    else if (key === 'ArrowUp') next = Math.max(0, active - 1);
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = options.length - 1;
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = performance.now();
      const query = (now - typeahead.current.time < 500 ? typeahead.current.query + key : key).toLowerCase();
      typeahead.current = { query, time: now };
      const match = options.findIndex(option => labelFor(option).toLowerCase().startsWith(query));
      if (match >= 0) next = match;
    } else return;
    event.preventDefault();
    setActive(next);
  };

  return <>
    <button ref={trigger} type="button" className="settings-select-trigger nodrag nopan" role="combobox" aria-label={label}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="listbox" disabled={disabled}
      style={{ borderRadius: surfaceRadius }} tabIndex={open ? -1 : undefined} onClick={show}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          show();
        }
      }}>
      <AnimatePresence initial={false}>
        {!open && <motion.span key="trigger" layoutId={layoutId} transition={morph} style={{ borderRadius: surfaceRadius }}
          aria-hidden="true" className="settings-select-fill settings-select-surface" />}
      </AnimatePresence>
      <span className="settings-select-row">
        <span className="settings-select-label">{currentLabel}</span>
        <img src="/gpt-sidebar/chevron.svg" width={18} height={18} alt="" />
      </span>
    </button>
    {placement && createPortal(<AnimatePresence initial={false}>
      {open && <motion.div ref={popup} key="popup" layoutId={layoutId} transition={openMorph}
        className="settings-select-popup settings-select-surface nodrag nopan nowheel"
        style={{
          borderRadius: surfaceRadius, left: placement.left, width: placement.width,
          top: placement.top, bottom: placement.bottom,
        }}>
        <motion.div ref={list} id={id} role="listbox" aria-label={menuLabel ?? label}
          aria-activedescendant={options[active] !== undefined ? `${id}-${active}` : undefined}
          tabIndex={-1} className="settings-select-list" style={{ maxHeight: placement.maxListHeight }}
          layout={reduceMotion ? false : 'position'} transition={openMorph} onKeyDown={onListKeyDown}>
          {options.map((option, index) => <div key={option} id={`${id}-${index}`} role="option"
            aria-selected={option === value} data-active={index === active}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
            <span className="settings-select-label">{labelFor(option)}</span>
            {option === value && <DescriberIcon name="check" />}
          </div>)}
        </motion.div>
      </motion.div>}
    </AnimatePresence>, placement.host)}
  </>;
}
