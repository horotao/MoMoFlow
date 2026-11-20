import { Location01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Ref } from 'react';
import './ResultEditButton.css';

export function ResultEditButton({ active, disabled, buttonRef, onToggle }: {
  active: boolean;
  disabled: boolean;
  buttonRef: Ref<HTMLButtonElement>;
  onToggle: (pointer: boolean) => void;
}) {
  return <button type="button" className="file-icon-button result-edit-motion nodrag nopan" ref={buttonRef}
    disabled={disabled} aria-pressed={active}
    onClick={event => { event.stopPropagation(); onToggle(event.detail > 0); }}
    onDoubleClick={event => event.stopPropagation()}>
    <span className="result-edit-reveal">交互编辑<span className="result-edit-sweep" aria-hidden="true" /></span>
    <HugeiconsIcon icon={Location01Icon} size={15} aria-hidden="true" />
  </button>;
}
