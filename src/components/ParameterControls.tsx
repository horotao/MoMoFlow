import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';

export function SettingsIcon({ name }: { name: 'close' | 'chevron' | 'info' }) {
  return <img className={`settings-icon settings-icon-${name}`} src={`/node-settings/${name}.svg`} alt="" aria-hidden="true" />;
}

export function ParameterSlider({ label, number, min, max, value, ...props }: {
  label: string; number: ReactNode; min: number; max: number; value: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max' | 'value'>) {
  return <div className="parameter-slider"><label htmlFor={props.id}>{label}</label><div className="parameter-slider-inputs">
    <input {...props} type="range" aria-label={props['aria-label'] ?? label} min={min} max={max} value={value}
      style={{ '--slider-progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties} />{number}
  </div></div>;
}

export function PreviewSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="settings-preview-switch"><span>实时预览</span><button type="button" role="switch" aria-label="实时预览" aria-checked={checked}
    disabled={disabled} title="控制拖动中的临时预览；提交后始终更新结果" onClick={() => onChange(!checked)}>
    <img src={`/node-settings/switch-${checked ? 'on' : 'off'}.svg`} width={34} height={20} alt="" />
  </button></div>;
}

export function SettingsSection({ children, label = '选项' }: { children: ReactNode; label?: string }) {
  return <details className="settings-section" open><summary>{label}<SettingsIcon name="chevron" /></summary><div>{children}</div></details>;
}
