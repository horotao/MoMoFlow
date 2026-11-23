import { NodeToolbarTooltip } from '../NodeToolbarTooltip';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ImagePromptIcon } from './ImagePromptIcon';
import { ImagePromptModelMenu, type PromptModelSelection } from './ImagePromptModelMenu';

import { textModelSelection } from '../../nodes/textGeneration';
import { textModels, textModelLabel } from './textModels';

export function TextModelPicker({ selection, onChange, locked = false, hidden = false, appearance = 'toolbar' }: {
  selection: PromptModelSelection; onChange: (selection: PromptModelSelection) => void; locked?: boolean; hidden?: boolean; appearance?: 'toolbar' | 'inspector';
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback((focus = false) => { setOpen(false); if (focus) trigger.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (locked || hidden) close(); }, [locked, hidden, close]);
  const modelButton = <button ref={trigger} type="button" className={appearance === 'inspector' ? 'generation-options-model' : 'image-node-toolbar-label'} aria-label={`选择文本模型：${textModelLabel(selection)}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={locked}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      <ImagePromptIcon name="model-openai" />{textModelLabel(selection)}<ImagePromptIcon name="chevron" />
    </button>;
  return <>
    {appearance === 'toolbar' ? <NodeToolbarTooltip label="选择文本模型">{modelButton}</NodeToolbarTooltip> : modelButton}
    {open && !locked && !hidden && <ImagePromptModelMenu id={id} anchor={trigger} label="选择文本模型" models={textModels}
      selection={textModelSelection(selection)} onChange={onChange} pinned={pinned} onPinnedChange={setPinned} onClose={close} />}
  </>;
}
