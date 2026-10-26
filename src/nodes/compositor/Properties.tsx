import { useRef, useState, type ReactNode } from 'react';
import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDown, ArrowUp, Blend, CircleDashed, Contrast, Eye, EyeOff, Frame, GripVertical, Link, Minus, Plus, RotateCcw, RotateCw, SlidersHorizontal, Square, Unlink } from 'lucide-react';
import { alignCompositorLayer, blendModes, newEffect, MAX_COMPOSITOR_EDGE, MAX_COMPOSITOR_PIXELS, type CompositorDocument, type CompositorEffect, type CompositorLayer, type LayerTransform, type ResolvedLayer } from '../compositor';
import { colorControls } from '../colorCorrection';
import { GraphicProperties, LayerIcon } from './GraphicProperties';
import { ColorField } from './ColorField';
import { LevelsEffectControls } from './LevelsEffectControls';
import { InspectorPopup, InspectorSelect, NumberField, Section, SliderField } from './InspectorControls';
import { reorderAtDrop, type DropSide } from './interaction';

const effectNames = { blur: '模糊', color: '色彩校正', invert: '反相', levels: '色阶' };
const effectIcons = { blur: CircleDashed, color: SlidersHorizontal, invert: Contrast, levels: Blend };
const alignment = [
  { label: 'Left', icon: AlignHorizontalJustifyStart }, { label: 'Center horizontally', icon: AlignHorizontalJustifyCenter }, { label: 'Right', icon: AlignHorizontalJustifyEnd },
  { label: 'Top', icon: AlignVerticalJustifyStart }, { label: 'Center vertically', icon: AlignVerticalJustifyCenter }, { label: 'Bottom', icon: AlignVerticalJustifyEnd },
];
const blendOptions = blendModes.map(value => ({ value, label: value === 'source-over' ? 'Normal' : value.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ') }));
function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
  return <div className="comp-labeled-control"><span className="comp-caption">{label}</span>{children}</div>;
}
function EffectPanel({ effect, onChange, onDraft, onCancel }: { effect: CompositorEffect; onChange: (value: CompositorEffect) => void; onDraft: (value: CompositorEffect) => void; onCancel: () => void }) {
  if (effect.type === 'invert') return <p className="comp-muted">Invert RGB colors while preserving transparency.</p>;
  if (effect.type === 'blur') return <>
    <div className="comp-effect-select"><span>Type</span><InspectorSelect label="Blur type" value={effect.settings.type} options={[{ value: 'gaussian', label: 'Gaussian' }, { value: 'box', label: 'Box' }]} onChange={type => onChange({ ...effect, settings: { ...effect.settings, type: type as 'box' | 'gaussian' } })} /></div>
    <SliderField label="Blur size" min={1} max={100} step={1} value={effect.settings.size} onDraft={size => onDraft({ ...effect, settings: { ...effect.settings, size } })} onCommit={size => onChange({ ...effect, settings: { ...effect.settings, size } })} onCancel={onCancel} />
  </>;
  if (effect.type === 'color') return <>{colorControls.map(control => <SliderField key={control.key} label={control.label} value={effect.settings[control.key]} min={control.min} max={control.max} step={control.step}
    onDraft={value => onDraft({ ...effect, settings: { ...effect.settings, [control.key]: value } })} onCommit={value => onChange({ ...effect, settings: { ...effect.settings, [control.key]: value } })} onCancel={onCancel} />)}</>;
  return <LevelsEffectControls settings={effect.settings} onDraft={settings => onDraft({ ...effect, settings })}
    onCommit={settings => onChange({ ...effect, settings })} onCancel={onCancel} />;
}
export function CompositorProperties({ document, size, layer, disabled, onChange, onLayer, onLayerDraft, onCanvasDraft, onCancelDraft, onEditContent }: {
  document: CompositorDocument; size: { width: number; height: number }; layer?: ResolvedLayer; disabled: boolean;
  onChange: (document: CompositorDocument) => void; onLayer: (patch: Partial<CompositorLayer>) => void; onLayerDraft: (patch: Partial<CompositorLayer>) => void; onCanvasDraft: (fill: string) => void; onCancelDraft: () => void; onEditContent: () => void;
}) {
  const [effectMenu, setEffectMenu] = useState<HTMLElement>(), [editingEffect, setEditingEffect] = useState<{ id: string; anchor: HTMLElement }>();
  const [message, setMessage] = useState(''), [dragOver, setDragOver] = useState<{ id: string; side: DropSide }>();
  const [dragging, setDragging] = useState<string>();
  const draggedEffect = useRef<string>();
  const unavailable = disabled || Boolean(layer?.locked);
  const closeEffect = () => { onCancelDraft(); setEditingEffect(undefined); };
  const resizeCanvas = (key: 'width' | 'height', value: number) => {
    let width = key === 'width' ? Math.round(value) : size.width, height = key === 'height' ? Math.round(value) : size.height;
    if (document.canvas.aspectLocked) { if (key === 'width') height = Math.round(width * size.height / size.width); else width = Math.round(height * size.width / size.height); }
    if (Math.max(width, height) > MAX_COMPOSITOR_EDGE || width * height > MAX_COMPOSITOR_PIXELS || Math.min(width, height) < 1) { setMessage('画布支持最长边 8192、最多 32MP。'); return; }
    setMessage(''); onChange({ ...document, canvas: { ...document.canvas, width, height, autoSize: false } });
  };
  const transform = (patch: Partial<LayerTransform>) => { if (layer) onLayer({ transform: { ...layer.transform, ...patch } }); };
  const resizeLayer = (key: 'width' | 'height', value: number) => {
    if (!layer) return;
    const patch = { [key]: value };
    if (layer.aspectLocked) { const other = key === 'width' ? 'height' : 'width'; patch[other] = Math.min(16384, Math.max(1, value * layer.transform[other] / layer.transform[key])); }
    transform(patch);
  };
  const reorderEffect = (id: string, target: number) => {
    if (!layer || unavailable || target < 0 || target >= layer.effects.length) return;
    const effects = [...layer.effects], index = effects.findIndex(item => item.id === id);
    if (index < 0 || index === target) return;
    const [effect] = effects.splice(index, 1); effects.splice(target, 0, effect); onLayer({ effects });
  };
  const activeEffect = layer?.effects.find(effect => effect.id === editingEffect?.id);
  const ActiveIcon = activeEffect ? effectIcons[activeEffect.type] : CircleDashed;
  return <aside className="comp-properties" aria-label="Properties">
    <header>{layer ? <LayerIcon source={layer.source} /> : <Frame />}<span>{layer?.name ?? 'Canvas'}</span></header>
    {message && <p role="alert" className="comp-error">{message}</p>}
    <fieldset disabled={unavailable}>
      {!layer ? <>
        <Section title="Dimensions"><div className="comp-dimensions"><NumberField label="Canvas width" prefix="W" min={1} max={8192} value={size.width} onChange={value => resizeCanvas('width', value)} /><NumberField label="Canvas height" prefix="H" min={1} max={8192} value={size.height} onChange={value => resizeCanvas('height', value)} />
          <button title="Lock aspect ratio" aria-label="Lock canvas aspect ratio" aria-pressed={document.canvas.aspectLocked} onClick={() => onChange({ ...document, canvas: { ...document.canvas, aspectLocked: !document.canvas.aspectLocked } })}>{document.canvas.aspectLocked ? <Link /> : <Unlink />}</button></div>
          <label className="comp-checkbox"><input type="checkbox" checked={document.canvas.autoSize} onChange={event => onChange({ ...document, canvas: { ...document.canvas, autoSize: event.target.checked, width: size.width, height: size.height } })} />Auto size from Background</label>
        </Section>
        <Section title="Fill" action={<button aria-label={document.canvas.fill ? 'Remove background' : 'Add background'} title={document.canvas.fill ? 'Transparent background' : 'Add background'} onClick={() => onChange({ ...document, canvas: { ...document.canvas, fill: document.canvas.fill ? null : '#ffffff' } })}>{document.canvas.fill ? <Minus /> : <Plus />}</button>}>
          {document.canvas.fill && <ColorField label="Canvas color" value={document.canvas.fill} disabled={unavailable} onDraft={onCanvasDraft} onCancel={onCancelDraft} onChange={fill => onChange({ ...document, canvas: { ...document.canvas, fill } })} />}
        </Section>
        <section className="comp-section comp-timeline"><label className="comp-checkbox"><input type="checkbox" checked={document.timeline.enabled} onChange={event => onChange({ ...document, timeline: { ...document.timeline, enabled: event.target.checked } })} />Timeline mode</label>
          {document.timeline.enabled && <><div className="comp-pair"><LabeledControl label="Duration"><NumberField label="Duration (s)" suffix="s" min={.1} max={86400} step={.1} value={document.timeline.duration} onChange={duration => onChange({ ...document, timeline: { ...document.timeline, duration } })} /></LabeledControl><LabeledControl label="Frame rate"><NumberField label="FPS" suffix="fps" min={1} max={120} value={document.timeline.fps} onChange={fps => onChange({ ...document, timeline: { ...document.timeline, fps: Math.round(fps) } })} /></LabeledControl></div><p className="comp-muted">Static frame. Video and keyframes are not available yet.</p></>}
        </section>
      </> : <>
        <Section title="Position"><div className="comp-pair comp-reserve-action"><NumberField label="X" prefix="X" value={layer.transform.x} onChange={x => transform({ x })} /><NumberField label="Y" prefix="Y" value={layer.transform.y} onChange={y => transform({ y })} /></div>
          <LabeledControl label="Alignment"><div className="comp-pair comp-reserve-action">{[0, 3].map(start => <div className="comp-align" key={start}>{alignment.slice(start, start + 3).map(({ label, icon: Icon }, i) => <button key={label} title={label} aria-label={label} onClick={() => transform(alignCompositorLayer(layer.transform, size, start + i))}><Icon /></button>)}</div>)}</div></LabeledControl>
          <LabeledControl label="Rotation"><div className="comp-pair comp-reserve-action"><NumberField label="Rotation" prefix={<RotateCcw />} suffix="°" min={-36000} max={36000} step={.1} value={layer.transform.rotation} onChange={rotation => transform({ rotation })} /><div className="comp-rotation-actions"><button aria-label="Rotate layer 90° clockwise" title="Rotate 90° clockwise" onClick={() => transform({ rotation: layer.transform.rotation + 90 })}><RotateCw /></button><button aria-label="Reset layer rotation" title="Reset rotation" onClick={() => transform({ rotation: 0 })}><RotateCcw /></button></div></div></LabeledControl>
        </Section>
        <Section title="Dimensions" action={layer.asset && <button aria-label="Reset to fit" title="Reset to fit" onClick={() => onLayer({ transform: undefined })}><RotateCcw /></button>}>
          <div className="comp-dimensions"><NumberField label="Width" prefix="W" min={1} max={16384} value={layer.transform.width} onChange={value => resizeLayer('width', value)} /><NumberField label="Height" prefix="H" min={1} max={16384} value={layer.transform.height} onChange={value => resizeLayer('height', value)} />
            <button aria-label="Lock layer aspect ratio" aria-pressed={layer.aspectLocked} title="Lock aspect ratio" onClick={() => onLayer({ aspectLocked: !layer.aspectLocked })}>{layer.aspectLocked ? <Link /> : <Unlink />}</button></div>
        </Section>
        <Section title="Appearance"><div className="comp-pair comp-reserve-action"><LabeledControl label="Opacity"><NumberField label="Opacity (%)" prefix={<Square />} suffix="%" min={0} max={100} value={layer.opacity * 100} onChange={opacity => onLayer({ opacity: opacity / 100 })} /></LabeledControl>
          <LabeledControl label="Blend mode"><InspectorSelect label="Blend mode" value={layer.blendMode} options={blendOptions} onChange={blendMode => onLayer({ blendMode: blendMode as CompositorLayer['blendMode'] })} /></LabeledControl></div>
        </Section>
        <GraphicProperties layer={layer} disabled={unavailable} onLayer={onLayer} onDraft={onLayerDraft} onCancel={onCancelDraft} onEdit={onEditContent} />
        <Section title="Stroke" action={<button aria-label={layer.stroke.enabled ? 'Remove stroke' : 'Add stroke'} title={layer.stroke.enabled ? 'Remove stroke' : 'Add stroke'} onClick={() => onLayer({ stroke: { ...layer.stroke, enabled: !layer.stroke.enabled } })}>{layer.stroke.enabled ? <Minus /> : <Plus />}</button>}>
          {layer.stroke.enabled && <div className="comp-stroke-controls"><ColorField label="Stroke color" value={layer.stroke.color} disabled={unavailable} onDraft={color => onLayerDraft({ stroke: { ...layer.stroke, color } })} onCancel={onCancelDraft} onChange={color => onLayer({ stroke: { ...layer.stroke, color } })} /><NumberField label="Stroke width" prefix={<SlidersHorizontal />} min={0} max={256} value={layer.stroke.width} onChange={width => onLayer({ stroke: { ...layer.stroke, width } })} /></div>}
          {layer.stroke.enabled && layer.source.kind === 'path' && <div className="comp-pair"><InspectorSelect label="Stroke join" value={layer.stroke.join ?? 'miter'} options={['miter', 'bevel', 'round'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={join => onLayer({ stroke: { ...layer.stroke, join: join as 'miter' | 'bevel' | 'round' } })} /><InspectorSelect label="Stroke endpoint" value={layer.stroke.cap ?? 'butt'} options={['butt', 'round', 'square'].map(value => ({ value, label: value === 'butt' ? 'Flat' : value[0].toUpperCase() + value.slice(1) }))} onChange={cap => onLayer({ stroke: { ...layer.stroke, cap: cap as 'butt' | 'round' | 'square' } })} /></div>}
        </Section>
        <Section title="Effects" action={<button aria-label="添加效果" title="添加效果" aria-haspopup="menu" aria-expanded={Boolean(effectMenu)} disabled={layer.effects.length >= 16} onClick={event => { closeEffect(); setEffectMenu(effectMenu ? undefined : event.currentTarget); }}><Plus /></button>}>
          {layer.effects.length > 0 && <div className="comp-effect-list">{layer.effects.map((effect, index) => {
            const Icon = effectIcons[effect.type];
            return <div className={`comp-effect-row${effect.enabled ? '' : ' is-disabled'}${dragging === effect.id ? ' is-dragging' : ''}${dragOver?.id === effect.id ? ` drop-${dragOver.side}` : ''}`} key={effect.id} draggable={!unavailable}
              onDragStart={event => { draggedEffect.current = effect.id; setDragging(effect.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', effect.id); closeEffect(); }}
              onDragOver={event => {
                if (!draggedEffect.current || draggedEffect.current === effect.id) return;
                event.preventDefault(); event.dataTransfer.dropEffect = 'move';
                const rect = event.currentTarget.getBoundingClientRect(), side = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                setDragOver(current => current?.id === effect.id && current.side === side ? current : { id: effect.id, side });
              }} onDragEnd={() => { draggedEffect.current = undefined; setDragging(undefined); setDragOver(undefined); }}
              onDrop={event => {
                event.preventDefault();
                if (draggedEffect.current && !unavailable) {
                  const rect = event.currentTarget.getBoundingClientRect(), side = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                  const effects = reorderAtDrop(layer.effects, draggedEffect.current, effect.id, side);
                  if (effects !== layer.effects) onLayer({ effects });
                }
                draggedEffect.current = undefined; setDragging(undefined); setDragOver(undefined);
              }}>
              <button className="comp-effect-open" aria-label={`Edit ${effectNames[effect.type]}`} aria-expanded={editingEffect?.id === effect.id} title="Edit effect · drag to reorder" onClick={event => { setEffectMenu(undefined); setEditingEffect(editingEffect?.id === effect.id ? undefined : { id: effect.id, anchor: event.currentTarget }); }}
                onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); reorderEffect(effect.id, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}><Icon /><GripVertical className="comp-effect-grip" /><span>{effectNames[effect.type]}</span></button>
              <button aria-label={`${effect.enabled ? 'Disable' : 'Enable'} ${effectNames[effect.type]}`} title={effect.enabled ? 'Hide effect' : 'Show effect'} onClick={() => onLayer({ effects: layer.effects.map(item => item.id === effect.id ? { ...item, enabled: !item.enabled } : item) })}>{effect.enabled ? <Eye /> : <EyeOff />}</button>
              <button aria-label={`Remove ${effectNames[effect.type]}`} title="Remove effect" onClick={() => { if (editingEffect?.id === effect.id) closeEffect(); onLayer({ effects: layer.effects.filter(item => item.id !== effect.id) }); }}><Minus /></button>
            </div>;
          })}</div>}
        </Section>
      </>}
    </fieldset>
    {layer?.locked && <p className="comp-muted comp-lock-note">Unlock this layer to edit its properties.</p>}
    {effectMenu && layer && !unavailable && <InspectorPopup anchor={effectMenu} menu width={160} onClose={() => setEffectMenu(undefined)}>
      {(['blur', 'color', 'invert', 'levels'] as const).map(type => { const Icon = effectIcons[type]; return <button key={type} role="menuitem" onClick={() => { onLayer({ effects: [...layer.effects, newEffect(type)] }); setEffectMenu(undefined); effectMenu.focus(); }}><Icon />{effectNames[type]}</button>; })}
    </InspectorPopup>}
    {activeEffect && editingEffect && layer && !unavailable && <InspectorPopup anchor={editingEffect.anchor} title={effectNames[activeEffect.type]} icon={<ActiveIcon />} width={activeEffect.type === 'levels' ? 240 : 260} onClose={closeEffect}>
      <div className="comp-effect-body"><EffectPanel key={activeEffect.id} effect={activeEffect} onChange={next => onLayer({ effects: layer.effects.map(item => item.id === next.id ? next : item) })}
        onDraft={next => onLayerDraft({ effects: layer.effects.map(item => item.id === next.id ? next : item) })} onCancel={onCancelDraft} /></div>
      <footer><span>Effect order</span><button aria-label={`Move ${effectNames[activeEffect.type]} earlier`} title="Move earlier" disabled={layer.effects[0].id === activeEffect.id} onClick={() => reorderEffect(activeEffect.id, layer.effects.findIndex(effect => effect.id === activeEffect.id) - 1)}><ArrowUp /></button><button aria-label={`Move ${effectNames[activeEffect.type]} later`} title="Move later" disabled={layer.effects[layer.effects.length - 1].id === activeEffect.id} onClick={() => reorderEffect(activeEffect.id, layer.effects.findIndex(effect => effect.id === activeEffect.id) + 1)}><ArrowDown /></button></footer>
    </InspectorPopup>}
  </aside>;
}
