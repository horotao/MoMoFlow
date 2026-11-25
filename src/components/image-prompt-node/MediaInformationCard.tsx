import { useId, useState, type ReactNode } from 'react';
import { ImagePromptIcon } from './ImagePromptIcon';

export function MediaInformationCard({ label, name, rows, children }: {
  label: string; name: string; rows: readonly (readonly string[])[]; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const hasDetails = rows.length > 0;
  return <section className="image-information" aria-label={label}>
    <header><h3 title={name}>{name}</h3><button type="button" className="image-information-toggle" aria-label={label}
      disabled={!hasDetails} aria-expanded={hasDetails && expanded} aria-controls={hasDetails ? detailsId : undefined}
      onClick={() => setExpanded(value => !value)}><ImagePromptIcon name="metadata-info" /></button></header>
    {hasDetails && expanded && <dl id={detailsId}>{rows.map(([field, value]) => <div key={field}>
      <dt>{field}</dt><dd title={value}>{value}</dd></div>)}</dl>}
    {children}
  </section>;
}
