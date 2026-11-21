import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ImagePromptIcon } from './ImagePromptIcon';

export function GenerationOptionSelect({ label, value, choices, labels, disabled, disabledChoices, onChange }: {
  label: string; value: string; choices: readonly string[]; labels?: readonly string[];
  disabled?: boolean; disabledChoices?: readonly string[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const options = choices.includes(value) ? choices : [value, ...choices];
  const text = (option: string) => labels?.[choices.indexOf(option)] ?? option;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return <Select.Root value={value} onValueChange={onChange} open={open && !disabled} onOpenChange={setOpen} disabled={disabled}>
    <Select.Trigger className="generation-option-value" aria-label={label}
      onPointerDownCapture={() => setKeyboard(false)} onKeyDownCapture={() => setKeyboard(true)}>
      <Select.Value>{text(value)}</Select.Value><Select.Icon className="generation-option-chevron"><ImagePromptIcon name="chevron" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="generation-option-menu nodrag nopan nowheel" aria-label={label}
        position="popper" side="bottom" align="start" sideOffset={4} collisionPadding={10}
        data-input={keyboard ? 'keyboard' : 'pointer'}
        onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
        onEscapeKeyDown={event => { event.stopPropagation(); setKeyboard(true); }}
        onKeyDown={event => { event.stopPropagation(); setKeyboard(true); }}>
        <Select.Viewport className="generation-option-viewport">
          <Select.Group>
            {options.map(option => <Select.Item className="generation-option-item" key={option} value={option} disabled={disabledChoices?.includes(option)}>
              <Select.ItemText>{text(option)}</Select.ItemText>
              <Select.ItemIndicator className="generation-option-indicator"><ImagePromptIcon name="check" /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.Group>
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
