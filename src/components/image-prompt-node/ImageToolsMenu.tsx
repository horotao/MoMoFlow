import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useRef, useState } from 'react';
import { ImagePromptIcon } from './ImagePromptIcon';
import { NodeToolbarTooltip } from '../NodeToolbarTooltip';
import './image-tools-menu.css';

export function ImageToolsMenu({ onCrop, active = false, disabled = false }: { onCrop?: () => void; active?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const startingCrop = useRef(false);
  return <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
    <NodeToolbarTooltip label={active ? '裁剪' : '工具'}><DropdownMenu.Trigger asChild><button type="button" className="image-node-toolbar-label image-node-tools-label" aria-label={active ? '裁剪' : '工具'}
      onPointerDown={() => setKeyboard(false)} onKeyDown={() => setKeyboard(true)}>
      <ImagePromptIcon name={active ? 'metadata-crop' : 'tools'} />{active ? '裁剪' : '工具'}<ImagePromptIcon name="chevron" />
    </button></DropdownMenu.Trigger></NodeToolbarTooltip>
    <DropdownMenu.Portal><DropdownMenu.Content className="image-node-tools-menu nodrag nopan nowheel" align="start" sideOffset={9}
      data-keyboard={keyboard} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => { setKeyboard(true); event.stopPropagation(); }}
      onEscapeKeyDown={event => event.stopPropagation()} onCloseAutoFocus={event => { if (active || startingCrop.current) event.preventDefault(); startingCrop.current = false; }}>
      <DropdownMenu.Item disabled={disabled || !onCrop} onSelect={() => { startingCrop.current = true; setOpen(false); onCrop?.(); }}><span className="image-tools-icon"><ImagePromptIcon name="metadata-crop" /></span>裁剪</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
