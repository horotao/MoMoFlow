import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { NodeToolbarTooltip } from '../components/NodeToolbarTooltip';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { ImagePromptModelBrand, ImagePromptModelMenu, type PromptModelOption, type PromptModelSelection } from '../components/image-prompt-node/ImagePromptModelMenu';

export function MediaModelPicker<Id extends string>({ label, name, brand, models, selection, onChange, pinned, onPinnedChange,
  disabled, appearance, singleSelection, groups }: {
  label: string; name: string; brand: string; models: readonly PromptModelOption<Id>[];
  selection: PromptModelSelection<Id>; onChange: (value: PromptModelSelection<Id>) => void;
  pinned: Id[]; onPinnedChange: (ids: Id[]) => void;
  disabled: boolean; appearance: 'toolbar' | 'inspector'; singleSelection?: boolean;
  groups?: { featured: readonly Id[]; providers: Readonly<Record<string, string>> };
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback((focus = false) => {
    setOpen(false);
    if (focus) anchor.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => { if (disabled) close(); }, [disabled, close]);
  const button = <button type="button" ref={anchor} disabled={disabled}
    className={appearance === 'toolbar' ? 'image-node-toolbar-label' : 'generation-options-model'}
    aria-label={label + '：' + name} aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open && !disabled}
    onClick={() => setOpen(value => !value)} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>
    <ImagePromptModelBrand brand={brand} /><span>{name}</span><ImagePromptIcon name="chevron" />
  </button>;
  return <>
    {appearance === 'toolbar' ? <NodeToolbarTooltip label={label}>{button}</NodeToolbarTooltip> : button}
    {open && !disabled && <ImagePromptModelMenu id={id} anchor={anchor} label={label} models={models} singleSelection={singleSelection} groups={groups}
      selection={selection} pinned={pinned} onPinnedChange={onPinnedChange} onClose={close} onChange={onChange}
      multipleHelp="为选中的模型分别创建预览结果。" />}
  </>;
}
