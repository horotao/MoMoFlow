import { Location01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Ref } from 'react';
import './InteractiveEditButton.css';

export function InteractiveEditButton({ active = false, disabled = false, buttonRef, onToggle }: {
  active?: boolean;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onToggle?: () => void;
}) {
  return <button
    type="button"
    ref={buttonRef}
    className="interactive-edit-button nodrag nopan"
    disabled={disabled}
    aria-disabled={onToggle ? undefined : true}
    aria-pressed={onToggle ? active : undefined}
    onClick={event => {
      event.stopPropagation();
      onToggle?.();
    }}
    onDoubleClick={event => event.stopPropagation()}
  >
    <HugeiconsIcon icon={Location01Icon} size={16} aria-hidden="true" />交互编辑
  </button>;
}
