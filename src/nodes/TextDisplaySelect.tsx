import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { TextDisplayMode } from './types';
import { NodeMenu } from './shared/NodeMenu';

const options: { value: TextDisplayMode; label: string }[] = [
  { value: 'source-value', label: '变量名+值' },
  { value: 'value', label: '变量值' },
  { value: 'source', label: '变量名' },
];

export function TextDisplaySelect({ value, onChange, children, appearance = 'default', disabled = false }: {
  value: TextDisplayMode;
  onChange: (value: TextDisplayMode) => void;
  children: ReactNode;
  appearance?: 'default' | 'shared';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const selected = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    items.current[selected]?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, selected]);

  useLayoutEffect(() => {
    if (!open || appearance !== 'shared') return;
    const place = () => {
      const button = trigger.current?.getBoundingClientRect();
      const menu = root.current?.querySelector('[role="listbox"]')?.getBoundingClientRect();
      if (!button || !menu) return;
      const gap = button.height / 4;
      setAbove(window.innerHeight - button.bottom < menu.height + gap + 8 && button.top >= menu.height + gap);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, appearance]);

  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    setAbove(Boolean(rect && window.innerHeight - rect.bottom < 130));
    setOpen(true);
  };

  return (
    <div ref={root} className={`text-node-display${appearance === 'shared' ? ' node-display' : ''} nodrag nopan nowheel`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}>
      <span>显示</span>
      <button ref={trigger} className="text-node-button text-node-display-trigger" type="button"
        disabled={disabled}
        aria-label={`显示：${options[selected].label}`} aria-haspopup="listbox"
        aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => open ? setOpen(false) : show()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}>
        <span>{options[selected].label}</span>{children}
      </button>
      {open && appearance === 'shared' && <NodeMenu id={listId} kind="listbox" label="变量显示方式"
        options={options.map(option => ({ action: option.value, label: option.label }))} selectedAction={value}
        className={`node-display-menu${above ? ' is-above' : ''}`}
        onChoose={action => {
          const option = options.find(option => option.value === action);
          if (option) onChange(option.value);
          setOpen(false); trigger.current?.focus();
        }} />}
      {open && appearance === 'default' && <div id={listId} role="listbox" aria-label="变量显示方式"
        className={`text-node-display-menu${above ? ' text-node-display-menu-above' : ''}`}>
        {options.map((option, index) => (
          <button key={option.value} ref={(element) => { items.current[index] = element; }}
            type="button" role="option" aria-selected={value === option.value}
            tabIndex={-1} className="text-node-display-option"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
              trigger.current?.focus();
            }}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowDown') next = (index + 1) % options.length;
              else if (event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = options.length - 1;
              else return;
              event.preventDefault();
              items.current[next]?.focus();
            }}>
            <span className="text-node-display-check" aria-hidden="true">{value === option.value ? '✓' : ''}</span>
            {option.label}
          </button>
        ))}
      </div>}
    </div>
  );
}
