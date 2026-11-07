import type { CSSProperties, InputHTMLAttributes } from 'react';
import './NodeRangeInput.css';

/** The drawing node's range control, also used in compact parameter rows. */
export function NodeRangeInput({ value, min = 0, max = 100, className = '', style, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'min' | 'max'> & {
  value: number;
  min?: number;
  max?: number;
}) {
  const progress = (value - min) / (max - min) * 100;
  return <input {...props} type="range" value={value} min={min} max={max}
    className={`node-range-input ${className}`}
    style={{ '--node-range-progress': `${progress}%`, ...style } as CSSProperties} />;
}
