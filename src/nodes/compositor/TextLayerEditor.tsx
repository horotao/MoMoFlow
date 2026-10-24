import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedLayer } from '../compositor';
import { MAX_TEXT_LENGTH, wrapText } from '../compositorGraphics';
import { useFrameDraft } from './useFrameDraft';

export function TextLayerEditor({ layer, zoom, onDraft, onFinish }: {
  layer: ResolvedLayer; zoom: number; onDraft: (text: string) => void; onFinish: (text?: string) => void;
}) {
  const source = layer.source;
  const [value, setValue] = useState(source.kind === 'text' ? source.text : '');
  const ref = useRef<HTMLTextAreaElement>(null), ended = useRef(false), current = useRef(value);
  const draft = useFrameDraft(onDraft);
  const metrics = useMemo(() => {
    if (source.kind !== 'text') return { top: 0, height: layer.transform.height };
    const ctx = window.document.createElement('canvas').getContext('2d')!;
    ctx.font = `${source.fontStyle} ${source.fontWeight} ${source.fontSize}px "${source.fontFamily}"`;
    const lines = wrapText(value, layer.transform.width, text => ctx.measureText(text).width + Math.max(0, Array.from(text).length - 1) * source.letterSpacing);
    const height = lines.length * source.fontSize * source.lineHeight;
    const top = source.verticalAlign === 'center' ? (layer.transform.height - height) / 2 : source.verticalAlign === 'bottom' ? layer.transform.height - height : 0;
    return { top, height: Math.max(height, layer.transform.height - top) };
  }, [value, source, layer.transform.width, layer.transform.height]);
  useLayoutEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  if (source.kind !== 'text') return null;
  const finish = (cancel = false) => { if (!ended.current) { ended.current = true; draft.clear(); onFinish(cancel ? undefined : current.current); } };
  return <div className="comp-text-editor" style={{ left: layer.transform.x, top: layer.transform.y, width: layer.transform.width, height: layer.transform.height, transform: `rotate(${layer.transform.rotation}deg)`, outlineWidth: 1 / zoom }}>
    {/* Canvas remains the single visible rendering, including fills and effects.
        The native textarea supplies selection, caret, clipboard and IME behavior. */}
    <textarea ref={ref} aria-label="Edit text layer" maxLength={MAX_TEXT_LENGTH} value={value} spellCheck={false}
      style={{ top: metrics.top, height: metrics.height, fontFamily: `"${source.fontFamily}", sans-serif`, fontSize: source.fontSize, fontWeight: source.fontWeight, fontStyle: source.fontStyle,
        lineHeight: source.lineHeight, letterSpacing: source.letterSpacing, textAlign: source.align }}
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
      onChange={event => { current.current = event.target.value; setValue(event.target.value); draft.schedule(event.target.value); }} onBlur={() => finish()}
      onKeyDown={event => {
        event.stopPropagation(); if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); finish(true); }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); finish(); }
        if (event.key === 'Tab') { event.preventDefault(); finish(); }
      }} />
  </div>;
}
