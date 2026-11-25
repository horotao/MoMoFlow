import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { NodeToolbarTooltip } from '../components/NodeToolbarTooltip';
import { ImagePromptIcon } from '../components/image-prompt-node/ImagePromptIcon';
import { ImagePromptModelBrand, ImagePromptModelMenu } from '../components/image-prompt-node/ImagePromptModelMenu';
import { videoModelDisplay, videoModels } from './videoComposer';
import type { VideoComposer } from './types';

export function VideoModelPicker({ composer, disabled, appearance, onEdit }: {
  composer: VideoComposer; disabled: boolean; appearance: 'toolbar' | 'inspector';
  onEdit: (change: Partial<VideoComposer>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState<VideoComposer['model'][]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { label, brand, selection } = videoModelDisplay(composer);
  const close = useCallback((focus = false) => {
    setOpen(false);
    if (focus) trigger.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => { if (disabled) close(); }, [disabled, close]);

  const button = <button type="button" ref={trigger} disabled={disabled}
    className={appearance === 'toolbar' ? 'image-node-toolbar-label' : 'generation-options-model'}
    aria-label={`选择视频模型：${label}`} aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-expanded={open}
    onClick={() => setOpen(value => !value)}
    onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
    <ImagePromptModelBrand brand={brand} /><span>{label}</span><ImagePromptIcon name="chevron" />
  </button>;
  return <>
    {appearance === 'toolbar' ? <NodeToolbarTooltip label="选择视频模型">{button}</NodeToolbarTooltip> : button}
    {open && !disabled && <ImagePromptModelMenu id={id} anchor={trigger} label="选择视频模型" models={videoModels}
      singleSelection selection={selection} pinned={pinned} onPinnedChange={setPinned} onClose={close}
      onChange={value => onEdit({ model: value.modelIds[0], selection: value })} />}
  </>;
}
