import { useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { CanvasHistoryContext } from '../../components/useCanvasHistory';
import {
  ColorPicker, ColorPickerAlpha, ColorPickerArea, ColorPickerChannels, ColorPickerContent,
  ColorPickerEyeDropper, ColorPickerHue, ColorPickerPresets, ColorPickerPreset, ColorPickerSwatch,
  ColorPickerTrigger, ColorPickerValue,
} from './BeuiColorPicker';
import { formatHex, parseHex } from './beuiColorPickerMath';
import { SPRING_SWAP } from './beuiColorPickerMotion';
import './NodeColorPicker.css';

const PRESETS = ['#3478f6', '#9270e8', '#e66aa4', '#e55656', '#ed9141', '#e5b63c', '#65a65a', '#169d83'];
const FORMATS = ['hex', 'rgb', 'hsl'] as const;
type Props = {
  color: string; opacity?: number; disabled?: boolean; label: string;
  triggerClassName: string; panelClassName: string; live?: boolean; align?: 'start' | 'end';
  onChange: (color: string, opacity: number) => void;
};
const colorValue = (color: string, opacity = 1) => formatHex({ ...parseHex(color)!, a: opacity });

// beUI supplies the spectrum, loupe, chip morph and preset hop. This adapter
// keeps React Flow history, node output formats and existing trigger geometry.
export function NodeColorPicker({ color, opacity, disabled, label, triggerClassName, panelClassName, live = false, align, onChange }: Props) {
  const incoming = colorValue(color, opacity);
  const [draft, setDraft] = useState(incoming);
  const [open, setOpen] = useState(false);
  const emitted = useRef(incoming), committed = useRef(incoming);
  const root = useRef<HTMLDivElement>(null);
  const history = useContext(CanvasHistoryContext);
  useEffect(() => {
    if (incoming !== emitted.current) {
      setDraft(incoming);
      committed.current = incoming;
    }
    emitted.current = incoming;
  }, [incoming]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const emit = (value: string) => {
    if (disabled) return;
    const rgba = parseHex(value)!;
    onChange(formatHex({ ...rgba, a: 1 }), rgba.a);
  };
  const cancel = () => {
    setDraft(committed.current);
    if (live) emit(committed.current);
  };
  const close = () => {
    cancel(); setOpen(false);
    root.current?.querySelector('button')?.focus({ preventScroll: true });
  };
  return <div ref={root} className={`node-color-picker-root ${triggerClassName === 'palette-edit-color' ? 'is-palette-inline' : ''}`}>
    <ColorPicker aria-label={`${label}控件`} value={draft} alpha={opacity !== undefined} disabled={disabled} open={open}
      className="node-color-picker-control"
      onOpenChange={next => {
        if (next) { setDraft(incoming); committed.current = incoming; }
        setOpen(next);
      }}
      onValueChange={value => {
        setDraft(value); emitted.current = value;
        if (live) emit(value);
      }}
      onValueCommit={value => {
        if (disabled) return;
        committed.current = value;
        if (!live) emit(value);
      }}
      onValueCancel={value => { setDraft(value); emitted.current = value; if (live) emit(value); }}>
      <ColorPickerTrigger className={`node-color-picker-trigger ${triggerClassName}`} aria-label={label} />
      <ColorPickerContent align={align} className={panelClassName} aria-label={label}
        onKeyDownCapture={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.dataset.canceling = 'true'; close(); }
        }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          const editing = (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]');
          if (!editing && !event.altKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault(); cancel();
            if (event.shiftKey) history.redo(); else history.undo();
          }
        }}>
        <ColorPickerArea />
        <div className="beui-picker-sliders-row">
          <ColorPickerEyeDropper />
          <div className="beui-picker-sliders"><ColorPickerHue label={live ? '色相' : 'Hue'} /><ColorPickerAlpha label={live ? '不透明度' : 'Opacity'} /></div>
        </div>
        <PickerFields live={live} />
        <ColorPickerPresets aria-label="预设颜色" className="justify-between px-0.5 pt-1">
          {PRESETS.map(value => <ColorPickerPreset key={value} value={value} label={`使用颜色 ${value.toUpperCase()}`} />)}
        </ColorPickerPresets>
      </ColorPickerContent>
    </ColorPicker>
  </div>;
}

function PickerFields({ live }: { live: boolean }) {
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('hex');
  const reduce = useReducedMotionConfig();
  const next = FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length];
  return <div className="beui-picker-fields">
    <button type="button" className="beui-picker-format" aria-label={`Format ${format.toUpperCase()}, switch to ${next.toUpperCase()}`}
      onClick={() => setFormat(next)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={format} initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -10 }} transition={SPRING_SWAP}>{format.toUpperCase()}</motion.span>
      </AnimatePresence>
    </button>
    {format === 'hex' ? <ColorPickerValue>{picker => <HexField {...picker} live={live} />}</ColorPickerValue> : <ColorPickerChannels format={format} />}
    {format === 'hex' && <ColorPickerSwatch />}
  </div>;
}

type HexProps = {
  hex: string; alpha: boolean; disabled: boolean; open: boolean; live: boolean;
  begin: () => void; preview: (value: string) => void; setColor: (value: string) => void;
};
function HexField({ hex, alpha, disabled, open, live, begin, preview, setColor }: HexProps) {
  const [text, setText] = useState<string | null>(null);
  const dirty = useRef(false);
  const settle = () => {
    if (!dirty.current || !open) return;
    dirty.current = false;
    const parsed = parseHex(text ?? '');
    // Palette colors remain six-digit opaque HEX; Painter accepts alpha too.
    if (parsed && (alpha || ![4, 8].includes((text ?? '').replace(/^#/, '').length))) {
      setColor(formatHex({ ...parsed, a: alpha && (text?.replace(/^#/, '').length === 4 || text?.replace(/^#/, '').length === 8) ? parsed.a : (parseHex(hex)?.a ?? 1) }));
    }
    setText(null);
  };
  useEffect(() => { if (!open) { dirty.current = false; setText(null); } }, [open]);
  return <div className="beui-picker-hex"><span aria-hidden="true">#</span>
    <input aria-label={live ? '十六进制颜色' : 'Hex color'} value={text ?? hex.slice(1).toUpperCase()} disabled={disabled}
      autoComplete="off" spellCheck={false} maxLength={alpha ? 9 : 7} onFocus={begin}
      onChange={event => {
        const value = event.target.value;
        dirty.current = true; setText(value);
        if (live && /^[\da-f]{6}$/i.test(value.replace(/^#/, ''))) {
          const parsed = parseHex(value)!;
          preview(formatHex({ ...parsed, a: parseHex(hex)!.a }));
        }
      }} onBlur={event => {
        if (event.currentTarget.closest('[data-canceling]')) { dirty.current = false; setText(null); }
        else settle();
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault(); settle(); event.currentTarget.blur();
        event.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus();
      }} />
  </div>;
}
