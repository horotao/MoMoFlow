import { useId, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon } from '@hugeicons/core-free-icons';

export function ParameterField({ label, children, exposeButton, detail, controlId, labelHint }: {
  label: string; children: ReactNode; exposeButton: ReactNode; detail?: ReactNode; controlId?: string; labelHint?: string;
}) {
  const hintId = useId();
  return <div className="describer-field parameter-field sunburst-parameter-field">
    {labelHint ? <div className="parameter-field-label-row">
      <label htmlFor={controlId}>{label}</label>
      <button type="button" className="parameter-field-hint-trigger" aria-label={`${label}说明`} aria-describedby={hintId}>
        <HugeiconsIcon icon={AlertCircleIcon} size={12} aria-hidden="true" />
      </button>
      <span id={hintId} role="tooltip" className="parameter-field-hint">{labelHint}</span>
    </div> : <label htmlFor={controlId}>{label}</label>}
    <div className="describer-field-row">{children}{exposeButton}</div>
    {detail}
  </div>;
}
