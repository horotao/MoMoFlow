import type { ReactNode } from 'react';

export function ParameterField({ label, children, exposeButton, detail, controlId }: {
  label: string; children: ReactNode; exposeButton: ReactNode; detail?: ReactNode; controlId?: string;
}) {
  return <div className="describer-field parameter-field sunburst-parameter-field">
    <label htmlFor={controlId}>{label}</label>
    <div className="describer-field-row">{children}{exposeButton}</div>
    {detail}
  </div>;
}
