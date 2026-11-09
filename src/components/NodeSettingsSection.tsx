import type { ReactNode } from 'react';

export function NodeSettingsSection({ title, icon, actions, children, className = '', fieldsClassName = '' }: {
  title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; fieldsClassName?: string;
}) {
  return <div className={`describer-settings node-settings-body ${className}`}>
    <h2>{icon}<span>{title}</span>{actions && <div className="node-settings-header-actions">{actions}</div>}</h2>
    <div className={`node-settings-fields ${fieldsClassName}`}>{children}</div>
  </div>;
}
