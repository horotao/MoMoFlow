import { NodeColorPicker } from './shared/NodeColorPicker';

export function PainterColorPicker({ label, color, opacity, disabled, onColor, onOpacity }: {
  label: string; color: string; opacity: number; disabled?: boolean;
  onColor: (value: string) => void; onOpacity: (value: number) => void;
}) {
  return <NodeColorPicker color={color} opacity={opacity} disabled={disabled} live label={`${label}选择器`}
    triggerClassName="painter-color-swatch" panelClassName="painter-design-picker"
    onChange={(value, alpha) => { onColor(value); onOpacity(alpha); }} />;
}
