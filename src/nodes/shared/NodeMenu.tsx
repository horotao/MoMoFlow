import { Fragment, useEffect, useRef, type KeyboardEvent } from 'react';
import { useFluidHover, useRegisterFluidHoverItem, type UseFluidHoverReturn } from '../../hooks/use-fluid-hover';
import { FluidHoverHighlight } from '../../components/fluid-hover-highlight';

export type NodeMenuOption = {
  action: string;
  label: string;
  shortcut?: string;
  shortcutKey?: string;
  disabled?: boolean;
  separatorBefore?: boolean;
};

function MenuItem({ option, index, kind, selected, hover, onChoose }: {
  option: NodeMenuOption;
  index: number;
  kind: 'menu' | 'listbox';
  selected: boolean;
  hover: UseFluidHoverReturn;
  onChoose: (action: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useRegisterFluidHoverItem(hover.registerItem, index, ref);
  return <button ref={ref} type="button" role={kind === 'menu' ? 'menuitem' : 'option'}
    aria-selected={kind === 'listbox' ? selected : undefined} disabled={option.disabled} tabIndex={-1}
    className="node-menu-item" data-action={option.action}
    onFocus={event => { if (event.currentTarget.matches(':focus-visible')) hover.setActiveIndex(index); }}
    onClick={() => onChoose(option.action)}>
    {kind === 'listbox' && <span className="node-menu-check" aria-hidden="true">{selected ? '✓' : ''}</span>}
    <span className="node-menu-label">{option.label}</span>
    {option.shortcut && <span className="node-menu-shortcut">{option.shortcut}</span>}
  </button>;
}

/** Shared popup content for node actions and compact option lists. */
export function NodeMenu({ id, label, options, onChoose, selectedAction, kind = 'menu', className = '' }: {
  id: string;
  label: string;
  options: NodeMenuOption[];
  onChoose: (action: string) => void;
  selectedAction?: string;
  kind?: 'menu' | 'listbox';
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(root, { axis: 'y', gapClick: false, isItemDisabled: item => (item as HTMLButtonElement).disabled });
  useEffect(() => {
    const items = root.current?.querySelectorAll<HTMLButtonElement>('.node-menu-item:not(:disabled)');
    const selected = Array.from(items ?? []).find(item => item.dataset.action === selectedAction);
    (selected ?? items?.[0])?.focus({ preventScroll: true });
  }, [selectedAction]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('.node-menu-item:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[next]?.focus({ preventScroll: true });
  };
  return <div ref={root} id={id} role={kind} aria-label={label}
    className={`node-menu node-menu-${kind} ${className}`} {...hover.handlers} onKeyDown={onKeyDown}>
    <FluidHoverHighlight hover={hover} className="node-menu-hover" />
    {options.map((option, index) => <Fragment key={option.action}>
      {option.separatorBefore && <div className="node-menu-separator" role="separator" />}
      <MenuItem option={option} index={index} kind={kind} selected={option.action === selectedAction}
        hover={hover} onChoose={onChoose} />
    </Fragment>)}
  </div>;
}
