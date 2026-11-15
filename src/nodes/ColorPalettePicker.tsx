import { NodeColorPicker } from './shared/NodeColorPicker';

export function ColorPalettePicker({ color, disabled, onChange, inline = false }: {
  color: string; disabled?: boolean; onChange: (hex: string) => void; inline?: boolean;
}) {
  return <NodeColorPicker color={color} disabled={disabled} label={`Edit color ${color}`}
    triggerClassName={inline ? 'palette-edit-color' : 'palette-swatch'} panelClassName="palette-picker"
    align="end" onChange={value => onChange(value.toUpperCase())} />;
}
