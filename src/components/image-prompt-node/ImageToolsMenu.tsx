import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useRef, useState } from 'react';
import { ImagePromptIcon, type ImagePromptIconName } from './ImagePromptIcon';
import { NodeToolbarTooltip } from '../NodeToolbarTooltip';
import { ScrollArea } from '../ui/scroll-area';
import './image-tools-menu.css';

export function ImageToolsMenu({ onCrop, onInpaint, active, disabled = false }: {
  onCrop?: () => void; onInpaint?: () => void; active?: 'crop' | 'inpaint'; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const startingEdit = useRef(false);
  const tools: { icon: ImagePromptIconName; label: string; action?: () => void }[] = [
    { icon: 'metadata-crop', label: '裁剪', action: active === 'inpaint' ? undefined : onCrop },
    { icon: 'metadata-upscale', label: '放大图片' },
    { icon: 'metadata-remove-background', label: '移除背景' },
    { icon: 'metadata-edit', label: '局部重绘', action: active === 'crop' ? undefined : onInpaint },
    { icon: 'metadata-extend', label: '扩图' },
  ];
  const mode = active === 'crop' ? tools[0] : active === 'inpaint' ? tools[3] : { icon: 'tools' as const, label: '工具' };
  return <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
    <NodeToolbarTooltip label={mode.label}><DropdownMenu.Trigger asChild><button type="button" className="image-node-toolbar-label image-node-tools-label" aria-label={mode.label}
      onPointerDown={() => setKeyboard(false)} onKeyDown={() => setKeyboard(true)}>
      <ImagePromptIcon name={mode.icon} />{mode.label}<ImagePromptIcon name="chevron" />
    </button></DropdownMenu.Trigger></NodeToolbarTooltip>
    <DropdownMenu.Portal><DropdownMenu.Content className="image-node-tools-menu nodrag nopan nowheel" align="start" sideOffset={9} updatePositionStrategy="always"
      data-keyboard={keyboard} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => { setKeyboard(true); event.stopPropagation(); }}
      onEscapeKeyDown={event => event.stopPropagation()} onCloseAutoFocus={event => { if (active || startingEdit.current) event.preventDefault(); startingEdit.current = false; }}>
      <ScrollArea className="image-tools-menu-scroll-area" viewportClassName="image-tools-menu-scroll">
        {tools.map(({ icon, label, action }) => <DropdownMenu.Item key={icon} disabled={disabled || !action} onSelect={() => {
          startingEdit.current = true;
          setOpen(false);
          action?.();
        }}>
          <span className="image-tools-icon"><ImagePromptIcon name={icon} /></span>{label}
        </DropdownMenu.Item>)}
      </ScrollArea>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
