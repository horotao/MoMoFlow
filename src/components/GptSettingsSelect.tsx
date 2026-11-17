import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { DescriberIcon } from './DescriberIcon';
import './GptSettingsControls.css';

// Adapted from beUI Select: the menu unfolds from the trigger and then separates.
// https://beui.dev/components/motion/select
const unfold = { type: 'spring', visualDuration: 0.2, bounce: 0.12 } as const;
const fold = { duration: 0.2, ease: [0.16, 1, 0.3, 1] } as const;
const radius = 12;
const gap = 8;
const optionHeight = 28;
const menuPadding = 10;

type Placement = {
  host: HTMLElement;
  scroller: HTMLElement | null;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  left: number;
  edge: number;
  width: number;
  height: number;
  above: boolean;
};

export function GptSettingsSelect({ label, choices, labels = choices, value, disabled, onChange }: {
  label: string;
  choices: readonly string[];
  labels?: readonly string[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ prefix: '', time: 0 });
  const selected = choices.indexOf(value);
  const [activeIndex, setActive] = useState(0);
  const active = Math.min(activeIndex, Math.max(0, choices.length - 1));
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [expanded, setOpen] = useState(false);
  const open = expanded && !disabled;
  const reduce = useReducedMotion();
  const progress = useMotionValue(0);
  const above = placement?.above ?? false;
  const rotation = useTransform(progress, [0, 1], [0, 180]);
  const triggerRadius = useTransform(progress, [0, 0.2, 0.4, 1], [radius, 0, 0, radius]);
  const reveal = useTransform(progress, [0, 1], [100, 0]);
  const opacity = useTransform(progress, [0, reduce ? 1 : 0.12], [0, 1]);
  const panelOffset = useTransform(progress, [0.4, 1], [above ? gap : -gap, 0]);
  const panelRadius = useTransform(progress, [0.4, 1], [0, radius]);
  const clip = useTransform([reveal, panelRadius], ([hidden, near]: number[]) => {
    if (hidden === 0) return 'none';
    return above
      ? `inset(${hidden}% 0 0 round ${radius}px ${radius}px ${near}px ${near}px)`
      : `inset(0 0 ${hidden}% round ${near}px ${near}px ${radius}px ${radius}px)`;
  });

  function show() {
    const button = trigger.current;
    const host = button?.closest<HTMLElement>('[data-settings-select-host]');
    if (!button || !host || disabled || !choices.length) return;
    const rect = button.getBoundingClientRect();
    const bounds = host.getBoundingClientRect();
    const below = Math.min(bounds.bottom, window.innerHeight) - rect.bottom - gap;
    const aboveSpace = rect.top - Math.max(bounds.top, 0) - gap;
    const desired = Math.min(choices.length * optionHeight + menuPadding, 234);
    const above = below < desired && aboveSpace > below;
    const scroller = button.closest<HTMLElement>('.node-settings-fields');
    setPlacement({
      scroller, scrollTop: scroller?.scrollTop ?? 0,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      host, above, width: rect.width, left: rect.left - bounds.left,
      edge: above ? bounds.bottom - rect.top + gap : rect.bottom - bounds.top + gap,
      height: Math.min(desired, Math.max(0, above ? aboveSpace : below)),
    });
    search.current = { prefix: '', time: 0 };
    setActive(Math.max(0, selected));
    setOpen(true);
  }

  function close() {
    trigger.current?.focus({ preventScroll: true });
    setOpen(false);
  }

  function choose(index: number) {
    if (disabled || choices[index] === undefined) return;
    close();
    onChange(choices[index]);
  }

  useLayoutEffect(() => {
    if (disabled) setOpen(false);
    if (!placement) return;
    const animation = animate(progress, open ? 1 : 0, {
      ...(reduce ? { duration: 0.12 } : open ? unfold : fold),
      onComplete: () => { if (!open) setPlacement(null); },
    });
    return () => animation.stop();
  }, [placement, open, progress, reduce, disabled]);

  useLayoutEffect(() => {
    if (open) menu.current?.focus({ preventScroll: true });
  }, [open]);

  useLayoutEffect(() => {
    const list = menu.current;
    const option = list?.children[active] as HTMLElement | undefined;
    if (!open || !list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [active, open]);

  useEffect(() => {
    if (!open || !placement) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const clearPlacement = () => {
      close();
      progress.jump(0);
      setPlacement(null);
    };
    const { scroller, scrollTop, viewportWidth, viewportHeight } = placement;
    // A scroll or resize event queued before the click may arrive after measuring.
    const onScroll = () => { if (scroller?.scrollTop !== scrollTop) clearPlacement(); };
    const onResize = () => {
      if (window.innerWidth !== viewportWidth || window.innerHeight !== viewportHeight) clearPlacement();
    };
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('resize', onResize);
    scroller?.addEventListener('scroll', onScroll);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('resize', onResize);
      scroller?.removeEventListener('scroll', onScroll);
    };
  }, [open, placement, progress]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || event.nativeEvent.isComposing) return;
    const { key } = event;
    if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape') event.preventDefault();
      close();
      return;
    }
    let next = active;
    if (key === 'Enter' || key === ' ') choose(active);
    else if (key === 'ArrowDown') next = Math.min(active + 1, choices.length - 1);
    else if (key === 'ArrowUp') next = Math.max(active - 1, 0);
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = choices.length - 1;
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = performance.now();
      const prefix = (now - search.current.time < 500 ? search.current.prefix + key : key).toLowerCase();
      search.current = { prefix, time: now };
      const match = labels.findIndex(option => option.toLowerCase().startsWith(prefix));
      if (match >= 0) next = match;
    } else return;
    event.preventDefault();
    setActive(next);
  }

  return (
    <>
      <motion.button ref={trigger} type="button" className="gpt-select-trigger" role="combobox"
        disabled={disabled} aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="listbox"
        onClick={() => open ? close() : show()}
        onKeyDown={event => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            show();
          }
        }}
        style={{
          borderTopLeftRadius: above && !reduce ? triggerRadius : radius,
          borderTopRightRadius: above && !reduce ? triggerRadius : radius,
          borderBottomLeftRadius: !above && !reduce ? triggerRadius : radius,
          borderBottomRightRadius: !above && !reduce ? triggerRadius : radius,
        }}>
        <span>{labels[selected] ?? value}</span>
        <motion.img src="/gpt-sidebar/select-chevron.svg" alt="" width="24" height="24" style={{ rotate: reduce ? (open ? 180 : 0) : rotation }} />
      </motion.button>
      {placement && createPortal(
        <motion.div ref={menu} id={id} role="listbox" aria-label={label} aria-hidden={!open}
          aria-activedescendant={open ? `${id}-${active}` : undefined} tabIndex={-1} onKeyDown={onMenuKeyDown}
          className="gpt-select-menu nodrag nopan nowheel" data-above={above}
          style={{
            left: placement.left, width: placement.width, maxHeight: placement.height,
            top: above ? undefined : placement.edge, bottom: above ? placement.edge : undefined,
            opacity, y: reduce ? 0 : panelOffset, clipPath: reduce ? 'none' : clip,
            borderTopLeftRadius: above || reduce ? radius : panelRadius,
            borderTopRightRadius: above || reduce ? radius : panelRadius,
            borderBottomLeftRadius: !above || reduce ? radius : panelRadius,
            borderBottomRightRadius: !above || reduce ? radius : panelRadius,
            pointerEvents: open ? 'auto' : 'none', zIndex: open ? 4 : 3,
          }}>
          {choices.map((option, index) => (
            <div key={option} id={`${id}-${index}`} role="option" aria-selected={selected === index}
              data-active={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
              <span>{labels[index]}</span>
              {selected === index && <DescriberIcon name="check" />}
            </div>
          ))}
        </motion.div>, placement.host)}
    </>
  );
}
