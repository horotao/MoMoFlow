import { forwardRef, useContext, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Schema, type Node as ProseNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { baseKeymap } from '@tiptap/pm/commands';
import { keymap } from '@tiptap/pm/keymap';
import { CanvasHistoryContext } from '../useCanvasHistory';
import { validPromptMentions, type MentionCandidate, type MentionEdit, type MentionSources } from '../../nodes/promptMentions';
import { decodePromptClipboard, encodePromptClipboard, promptClipboardHtml, promptMentionClipboardType } from '../../nodes/promptMentionClipboard';
import type { PromptMention } from '../../nodes/types';
import { ImagePromptIcon } from './ImagePromptIcon';
import './prompt-mention-editor.css';

const imagePlaceholder = new URL('./assets/image.svg', import.meta.url).href;
const schema = new Schema({ nodes: {
  doc: { content: 'inline*' },
  text: { group: 'inline' },
  mention: {
    inline: true, group: 'inline', atom: true, selectable: true,
    attrs: { nodeId: {}, label: {}, url: { default: null } },
    toDOM: node => ['span', { class: 'mention-chip', 'data-node-id': node.attrs.nodeId, contenteditable: 'false', title: node.attrs.label },
      ['span', { class: 'mention-chip-icon-wrap' }, node.attrs.url
        ? ['img', { src: node.attrs.url, alt: node.attrs.label, draggable: 'false' }]
        : ['img', { class: 'mention-chip-placeholder', src: imagePlaceholder, alt: '', draggable: 'false' }]],
      ['span', { class: 'mention-chip-label' }, node.attrs.label]],
    leafText: node => node.attrs.label,
  },
} });
function documentFor(prompt: string, mentions: readonly PromptMention[], candidates: readonly MentionCandidate[], pasted = false) {
  const content: ProseNode[] = [];
  let offset = 0;
  for (const mention of validPromptMentions(prompt, mentions)) {
    if (mention.from > offset) content.push(schema.text(prompt.slice(offset, mention.from)));
    const candidate = candidates.find(item => item.id === mention.nodeId);
    // Disconnected/deleted sources become ordinary readable text, without
    // silently reconnecting them when the user edits another part of a prompt.
    content.push(candidate && (candidate.connected || pasted) ? schema.nodes.mention.create({ nodeId: mention.nodeId,
      label: prompt.slice(mention.from, mention.to), url: candidate.url }) : schema.text(prompt.slice(mention.from, mention.to)));
    offset = mention.to;
  }
  if (offset < prompt.length) content.push(schema.text(prompt.slice(offset)));
  return schema.nodes.doc.create(null, content);
}
function serialize(doc: ProseNode): MentionEdit {
  let prompt = '';
  const mentions: PromptMention[] = [];
  doc.forEach(node => {
    if (node.type.name === 'mention') {
      const from = prompt.length;
      prompt += node.attrs.label;
      mentions.push({ nodeId: node.attrs.nodeId, from, to: prompt.length });
    } else prompt += node.textContent;
  });
  return { prompt, mentions };
}
interface Picker { from: number; to: number; query: string; x: number; y: number; above: boolean; maxHeight: number }
export interface PromptMentionEditorHandle { focus: () => void; mention: () => void }
interface Props {
  kind?: 'image' | 'text';
  prompt: string; mentions?: readonly PromptMention[]; candidates?: readonly MentionCandidate[]; readOnly?: boolean;
  suggestion: string; onChange: (prompt: string) => void;
  onEdit?: (edit: MentionEdit, sourceId?: MentionSources) => boolean;
}
const empty: readonly MentionCandidate[] = [];
const noMentions: readonly PromptMention[] = [];
export const PromptMentionEditor = forwardRef<PromptMentionEditorHandle, Props>(function PromptMentionEditor({
  kind = 'image', prompt, mentions = noMentions, candidates = empty, readOnly = false, suggestion, onChange, onEdit,
}, ref) {
  const host = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const latest = useRef({ prompt, mentions, candidates, readOnly, suggestion, onChange, onEdit });
  latest.current = { prompt, mentions, candidates, readOnly, suggestion, onChange, onEdit };
  const controlledDocument = useRef(JSON.stringify([prompt, mentions]));
  const history = useContext(CanvasHistoryContext);
  const historyRef = useRef(history); historyRef.current = history;
  const [picker, setPicker] = useState<Picker | null>(null);
  const pickerRef = useRef<Picker | null>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const dismissed = useRef<number>();
  const listId = useRef(`mention-${crypto.randomUUID()}`).current;
  const filtered = candidates.filter(item => item.name.toLocaleLowerCase().includes(picker?.query.toLocaleLowerCase() ?? ''));
  const items = [...filtered.filter(item => item.connected), ...filtered.filter(item => !item.connected)];
  const itemsRef = useRef(items); itemsRef.current = items;
  const setIndex = (index: number, scroll = false) => {
    activeRef.current = index; setActive(index);
    if (!scroll) return;
    const list = scrollArea.current;
    const option = list?.querySelectorAll<HTMLElement>('[role="option"]')[index];
    if (!list || !option) return;
    // Scroll this list only. scrollIntoView can also scroll the canvas's
    // ancestors, and pointer hover should never pull the list back upwards.
    const row = option.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    const top = bounds.top + list.clientTop, bottom = top + list.clientHeight;
    if (row.top < top) list.scrollTop += row.top - top;
    else if (row.bottom > bottom) list.scrollTop += row.bottom - bottom;
  };
  const close = () => { pickerRef.current = null; setPicker(null); };
  const updatePicker = (editor: EditorView) => {
    if (latest.current.readOnly || editor.composing || !editor.hasFocus() || !editor.state.selection.empty) { close(); return; }
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(0, from, '', '\ufffc');
    const match = /@([^@\n\ufffc]*)$/.exec(before);
    if (!match) { dismissed.current = undefined; close(); return; }
    const start = from - match[1].length - 1;
    if (dismissed.current === start) { close(); return; }
    const rect = editor.coordsAtPos(start);
    const max = Math.min(278, window.innerHeight - 24);
    const width = 256;
    const below = window.innerHeight - rect.bottom - 12;
    const above = below < max && rect.top > below;
    const next = { from: start, to: from, query: match[1], x: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8)),
      y: above ? rect.top - 8 : rect.bottom + 8, above, maxHeight: Math.min(max, Math.max(80, above ? rect.top - 16 : below)) };
    if (pickerRef.current?.query !== next.query || pickerRef.current?.from !== start) setIndex(0);
    pickerRef.current = next; setPicker(next);
  };
  const choose = (candidate: MentionCandidate) => {
    const editor = view.current, range = pickerRef.current;
    if (!editor || !range || candidate.disabled || latest.current.readOnly) return;
    const chip = schema.nodes.mention.create({ nodeId: candidate.id, label: candidate.name, url: candidate.url });
    let tr = editor.state.tr.replaceWith(range.from, range.to, [chip, schema.text(' ')]);
    tr = tr.setSelection(TextSelection.create(tr.doc, range.from + 2));
    if (latest.current.onEdit?.(serialize(tr.doc), candidate.id) === false) return;
    editor.updateState(editor.state.apply(tr));
    dismissed.current = undefined; close(); editor.focus();
  };
  const chooseRef = useRef(choose); chooseRef.current = choose;
  const copySelection = (editor: EditorView, event: ClipboardEvent) => {
    if (editor.state.selection.empty || !event.clipboardData) return false;
    const edit = serialize(schema.nodes.doc.create(null, editor.state.selection.content().content));
    event.clipboardData.setData('text/plain', edit.prompt);
    event.clipboardData.setData('text/html', promptClipboardHtml(edit));
    event.clipboardData.setData(promptMentionClipboardType, encodePromptClipboard(edit));
    event.preventDefault();
    return true;
  };
  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    mention: () => {
      const editor = view.current;
      if (!editor || latest.current.readOnly) return;
      dismissed.current = undefined; editor.focus();
      editor.dispatch(editor.state.tr.insertText('@'));
    },
  }), []);
  useLayoutEffect(() => {
    const doc = documentFor(latest.current.prompt, latest.current.mentions, latest.current.candidates);
    const editor = new EditorView(host.current!, {
      state: EditorState.create({ schema, doc, selection: TextSelection.atEnd(doc), plugins: [keymap(baseKeymap)] }),
      attributes: { class: 'image-node-prompt-editor nodrag nopan nowheel', role: 'textbox', 'aria-autocomplete': 'list', 'aria-haspopup': 'listbox', 'aria-label': 'Chat message', 'aria-multiline': 'true', spellcheck: 'true' },
      editable: () => !latest.current.readOnly,
      dispatchTransaction: tr => {
        const next = editor.state.apply(tr);
        if (tr.docChanged) {
          const edit = serialize(next.doc);
          if (latest.current.onEdit) {
            if (!latest.current.onEdit(edit)) return;
          } else latest.current.onChange(edit.prompt);
        }
        editor.updateState(next);
        updatePicker(editor);
      },
      handleKeyDown: (editor, event) => {
        if (event.isComposing || editor.composing) return false;
        if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
          event.preventDefault(); close();
          if (event.shiftKey || event.key.toLowerCase() === 'y') historyRef.current.redo(); else historyRef.current.undo();
          return true;
        }
        if (pickerRef.current) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismissed.current = pickerRef.current.from; close(); return true; }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const n = itemsRef.current.length;
            setIndex(n ? event.key === 'Home' ? 0 : event.key === 'End' ? n - 1 : (activeRef.current + (event.key === 'ArrowDown' ? 1 : -1) + n) % n : 0, true);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab' && !event.shiftKey) {
            const item = itemsRef.current[activeRef.current];
            if (item) { event.preventDefault(); chooseRef.current(item); return true; }
          }
        }
        if (event.key === 'Enter' && !latest.current.readOnly) { editor.dispatch(editor.state.tr.insertText('\n')); return true; }
        if (event.key === 'Tab' && !event.shiftKey && !editor.state.doc.content.size && !latest.current.readOnly) {
          editor.dispatch(editor.state.tr.insertText(latest.current.suggestion)); return true;
        }
        return false;
      },
      handlePaste: (editor, event) => {
        if (latest.current.readOnly) return false;
        const clipboard = event.clipboardData;
        const plain = clipboard?.getData('text/plain') ?? '';
        let edit = decodePromptClipboard(clipboard?.getData(promptMentionClipboardType) ?? '', plain);
        const html = clipboard?.getData('text/html') ?? '';
        if (!edit && html.includes('data-momoflow-prompt=')) {
          const payload = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-momoflow-prompt]')?.getAttribute('data-momoflow-prompt');
          edit = decodePromptClipboard(payload ?? '', plain);
        }
        if (edit?.mentions.length && latest.current.onEdit) {
          // Capacity is validated after replaced capsules release their wires.
          const mentions = edit.mentions.filter(mention => latest.current.candidates.some(item => item.id === mention.nodeId));
          const doc = documentFor(edit.prompt, mentions, latest.current.candidates, true);
          const tr = editor.state.tr.replaceWith(editor.state.selection.from, editor.state.selection.to, doc.content);
          tr.setSelection(TextSelection.create(tr.doc, editor.state.selection.from + doc.content.size));
          if (latest.current.onEdit(serialize(tr.doc), mentions.map(mention => mention.nodeId))) {
            editor.updateState(editor.state.apply(tr)); close(); editor.focus(); return true;
          }
        }
        editor.dispatch(editor.state.tr.insertText(plain)); return true;
      },
      handleDOMEvents: {
        copy: (editor, event) => copySelection(editor, event),
        cut: (editor, event) => {
          if (latest.current.readOnly || !copySelection(editor, event)) return false;
          editor.dispatch(editor.state.tr.deleteSelection()); return true;
        },
        focus: editor => { updatePicker(editor); return false; },
        blur: () => { close(); return false; },
        compositionend: editor => { queueMicrotask(() => updatePicker(editor)); return false; },
      },
    });
    view.current = editor;
    const dismiss = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) close();
    };
    const reposition = (event?: Event) => {
      if (event?.target instanceof Node && menu.current?.contains(event.target)) return;
      if (pickerRef.current) updatePicker(editor);
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    const viewport = host.current?.closest('.react-flow__viewport');
    let transform = viewport?.getAttribute('style');
    const observer = new MutationObserver(() => {
      const next = viewport?.getAttribute('style');
      if (next === transform) return;
      transform = next;
      reposition();
    });
    if (viewport) observer.observe(viewport, { attributes: true, attributeFilter: ['style'] });
    return () => {
      observer.disconnect(); editor.destroy(); view.current = undefined;
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
    // All changing values are read through latest; the editor owns its selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const signature = JSON.stringify([prompt, mentions]);
    const changed = controlledDocument.current !== signature;
    controlledDocument.current = signature;
    // Picker hover/scroll can render before React Flow acknowledges an edit.
    // Reconcile changed external content, otherwise keep the live document and
    // its caret while updating thumbnails/connection availability.
    const live = changed ? { prompt, mentions } : serialize(editor.state.doc);
    const doc = documentFor(live.prompt, live.mentions, candidates);
    if (!doc.eq(editor.state.doc) && !editor.composing) {
      const from = editor.hasFocus() ? Math.min(editor.state.selection.from, doc.content.size) : doc.content.size;
      editor.updateState(EditorState.create({ schema, doc, selection: TextSelection.create(doc, from), plugins: editor.state.plugins }));
    }
    editor.setProps({ editable: () => !readOnly });
    if (readOnly) close();
  }, [prompt, mentions, candidates, readOnly]);
  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dom.setAttribute('aria-expanded', String(Boolean(picker)));
    if (picker) {
      editor.dom.setAttribute('aria-controls', listId);
      editor.dom.setAttribute('aria-activedescendant', `${listId}-${active}`);
    } else { editor.dom.removeAttribute('aria-controls'); editor.dom.removeAttribute('aria-activedescendant'); }
  }, [picker, active, listId]);
  return <>
    <div ref={host} className="image-node-prompt-host" />
    {picker && createPortal(<div ref={menu} id={listId} role="listbox" aria-label="Mention" data-kind={kind} className="image-mention-menu nodrag nopan nowheel"
      style={{ left: picker.x, top: picker.y, maxHeight: picker.maxHeight, transform: picker.above ? 'translateY(-100%)' : undefined }}
      onPointerDown={event => event.preventDefault()} onWheel={event => event.stopPropagation()}>
      <div className="image-mention-clip"><div ref={scrollArea} className="image-mention-scroll" style={{ maxHeight: picker.maxHeight - 6 }}>
      {(['Connected nodes', 'All nodes'] as const).map((label, group) => {
        const grouped = items.filter(item => item.connected === (group === 0));
        return grouped.length > 0 && <div role="group" aria-label={label} key={label}>
          <div className="image-mention-label">{label}</div>
          {grouped.map(item => { const index = items.indexOf(item); return <div key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}
            aria-disabled={Boolean(item.disabled)} title={item.disabled || item.name} className="image-mention-option"
            onClick={() => choose(item)}>
            <span className="image-mention-thumbnail">{item.url ? <img src={item.url} alt="" draggable={false} /> : <ImagePromptIcon name="image" />}</span>
            <span className="image-mention-name">{item.name}</span>
          </div>; })}
        </div>;
      })}
      {!items.length && <div className="image-mention-empty">No nodes found</div>}
      </div></div>
    </div>, document.body)}
  </>;
});
