import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CanvasHistoryContext } from '../useCanvasHistory';

// Match the clicked text run to the raw Markdown, including repeated words in later paragraphs.
function sourceCaret(preview: HTMLElement, text: string, selection: Selection | null) {
  if (!selection?.focusNode || !preview.contains(selection.focusNode)) return text.length;
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent ?? '';
    const index = text.indexOf(value, offset);
    if (node === selection.focusNode) return index < 0 ? offset : index + selection.focusOffset;
    if (index >= 0) offset = index + value.length;
  }
  return offset;
}

export function EditableTextResult({ text, onChange, children }: {
  text: string; onChange: (text: string) => void; children: ReactNode;
}) {
  const [caret, setCaret] = useState<number | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const { endEditGroup } = useContext(CanvasHistoryContext);
  useLayoutEffect(() => {
    if (caret === null || !field.current) return;
    endEditGroup();
    field.current.focus({ preventScroll: true });
    field.current.setSelectionRange(caret, caret);
    return endEditGroup;
  }, [caret, endEditGroup]);
  return <div ref={preview} className="text-node-editable" role="group" aria-label="编辑生成文本"
    tabIndex={caret === null ? 0 : -1} title={caret === null ? '点击编辑生成文本' : undefined}
    onClick={event => {
      if (caret !== null || (event.target as HTMLElement).closest('a')) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setCaret(sourceCaret(event.currentTarget, text, selection));
    }}
    onKeyDown={event => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); event.stopPropagation(); setCaret(0);
      }
    }}>
    {caret === null ? text ? children : <span className="text-node-output-placeholder">点击编辑文本</span>
      : <textarea ref={field} className="text-node-result-editor nodrag nopan nowheel" aria-label="生成文本"
        defaultValue={text} onChange={event => onChange(event.currentTarget.value)}
        onBlur={() => setCaret(null)} onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.preventDefault(); preview.current?.focus({ preventScroll: true });
          }
        }} />}
  </div>;
}
