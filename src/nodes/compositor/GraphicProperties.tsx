import { AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Minus, Plus, Type, PenTool, Image, Square, Circle, Triangle, Star } from 'lucide-react';
import type { CompositorLayer, ResolvedLayer } from '../compositor';
import { graphicFonts, isGraphicSource } from '../compositorGraphics';
import { ColorField } from './ColorField';
import { InspectorSelect, NumberField, Section } from './InspectorControls';

export function LayerIcon({ source }: { source: CompositorLayer['source'] }) {
  const Icon = source.kind === 'text' ? Type : source.kind === 'path' ? PenTool : source.kind === 'shape'
    ? { rectangle: Square, ellipse: Circle, triangle: Triangle, star: Star }[source.shape] : Image;
  return <Icon size={14} />;
}
export function GraphicProperties({ layer, disabled, onLayer, onDraft, onCancel, onEdit }: {
  layer: ResolvedLayer; disabled: boolean; onLayer: (patch: Partial<CompositorLayer>) => void; onDraft: (patch: Partial<CompositorLayer>) => void; onCancel: () => void; onEdit: () => void;
}) {
  const source = layer.source;
  if (!isGraphicSource(source)) return null;
  return <>
    {source.kind === 'text' && <Section title="Typography" action={<button aria-label="Edit text" title="Edit text" onClick={onEdit}><Type /></button>}>
      <div className="comp-typography-controls"><InspectorSelect label="Font family" value={source.fontFamily} options={graphicFonts.map(value => ({ value, label: value === 'Text Node Inter' ? 'Inter' : value === 'sans-serif' ? 'System sans' : value }))} onChange={fontFamily => onLayer({ source: { ...source, fontFamily: fontFamily as typeof source.fontFamily } })} />
      <div className="comp-pair"><InspectorSelect label="Font weight" value={String(source.fontWeight)} options={[{ value: '400', label: 'Regular' }, { value: '500', label: 'Medium' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' }, { value: '900', label: 'Black' }]} onChange={weight => onLayer({ source: { ...source, fontWeight: Number(weight) } })} />
        <InspectorSelect label="Font style" value={source.fontStyle} options={[{ value: 'normal', label: 'Normal' }, { value: 'italic', label: 'Italic' }]} onChange={style => onLayer({ source: { ...source, fontStyle: style as typeof source.fontStyle } })} /></div>
      <div className="comp-pair"><NumberField label="Font size" prefix="Size" min={1} max={2048} value={source.fontSize} onChange={fontSize => onLayer({ source: { ...source, fontSize } })} />
        <NumberField label="Line height" prefix="Line" suffix="%" min={50} max={500} value={source.lineHeight * 100} onChange={value => onLayer({ source: { ...source, lineHeight: value / 100 } })} /></div>
      <NumberField label="Letter spacing" prefix="Spacing" suffix="px" min={-100} max={500} step={.1} value={source.letterSpacing} onChange={letterSpacing => onLayer({ source: { ...source, letterSpacing } })} />
      <div className="comp-pair"><div className="comp-align">{(['left', 'center', 'right'] as const).map((align, index) => { const Icon = [AlignLeft, AlignCenter, AlignRight][index]; return <button key={align} aria-label={`Text align ${align}`} title={`Align ${align}`} aria-pressed={source.align === align} onClick={() => onLayer({ source: { ...source, align } })}><Icon /></button>; })}</div>
        <div className="comp-align">{(['top', 'center', 'bottom'] as const).map((verticalAlign, index) => { const Icon = [AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd][index]; return <button key={verticalAlign} aria-label={`Text align ${verticalAlign} vertically`} title={`Align ${verticalAlign}`} aria-pressed={source.verticalAlign === verticalAlign} onClick={() => onLayer({ source: { ...source, verticalAlign } })}><Icon /></button>; })}</div></div>
      </div>
    </Section>}
    {source.kind === 'path' && <Section title="Vector"><button className="comp-edit-content" onClick={onEdit}><PenTool />Edit path</button><label className="comp-checkbox"><input type="checkbox" checked={source.closed} onChange={event => onLayer({ source: { ...source, closed: event.target.checked } })} />Closed path</label></Section>}
    <Section title="Fill" action={<button aria-label={source.fill ? 'Remove layer fill' : 'Add layer fill'} onClick={() => onLayer({ source: { ...source, fill: source.fill ? null : '#ffffff' } })}>{source.fill ? <Minus /> : <Plus />}</button>}>
      {source.fill && <ColorField label="Layer fill" value={source.fill} disabled={disabled} onDraft={fill => onDraft({ source: { ...source, fill } })} onCancel={onCancel} onChange={fill => onLayer({ source: { ...source, fill } })} />}
    </Section>
  </>;
}
