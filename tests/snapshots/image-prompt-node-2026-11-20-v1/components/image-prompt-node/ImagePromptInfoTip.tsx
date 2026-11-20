import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-prompt-info-tip.css';

export function ImagePromptInfoTip({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  return <Tooltip.Root open={open} onOpenChange={setOpen}>
    <Tooltip.Trigger asChild>
      <button type="button" className="image-model-info-icon" aria-label={`关于${label}`}
        onClick={event => event.stopPropagation()}><ImagePromptIcon name="info" /></button>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content side="top" sideOffset={4} collisionPadding={8} className="image-model-info-tip-content"
        onEscapeKeyDown={event => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }}>
        {children}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
