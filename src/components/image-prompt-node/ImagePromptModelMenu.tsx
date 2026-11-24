import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ImagePromptInfoTip } from './ImagePromptInfoTip';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-prompt-model-menu.css';

export function ImagePromptModelBrand({ brand }: { brand: string }) {
  if (brand === 'openai') return <ImagePromptIcon name="model-openai" />;
  const src = brand === 'deepseek' ? new URL('./assets/deepseek.svg', import.meta.url).href
    : brand === 'bytedance' ? new URL('./assets/bytedance.svg', import.meta.url).href
      : new URL('./assets/google.svg', import.meta.url).href;
  return <img className="image-model-logo" src={src} alt="" />;
}

export interface PromptModelOption<Id extends string = string> {
  id: Id; name: string; brand: string; time?: string; channel?: string; description: string; isNew?: boolean;
}
export interface PromptModelSelection<Id extends string = string> {
  modelIds: Id[]; autoSelect: boolean; multiple: boolean;
}
interface ModelMenuProps<Id extends string> {
  id: string;
  anchor: RefObject<HTMLButtonElement>;
  models: readonly PromptModelOption<Id>[];
  label?: string;
  selection: PromptModelSelection<Id>;
  onChange: (selection: PromptModelSelection<Id>) => void;
  pinned: Id[];
  onPinnedChange: (pinned: Id[]) => void;
  onClose: (restoreFocus?: boolean) => void;
  singleSelection?: boolean;
  multipleHelp?: string;
}

export function ImagePromptModelMenu<Id extends string>({ id, anchor, models, label = '选择图像模型', selection, onChange, pinned, onPinnedChange, onClose, singleSelection = false,
  multipleHelp = '第一个选中的模型在当前节点生成，其余模型分别新建节点。' }: ModelMenuProps<Id>) {
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const pendingPinFocus = useRef<Id | null>(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0, above: false });
  const titleId = useId();
  const autoSelectId = useId();
  const multipleId = useId();
  const filtered = models.filter(model => `${model.name} ${model.brand} ${model.channel ?? ''} ${model.description}`.toLowerCase().includes(query.trim().toLowerCase()));

  useLayoutEffect(() => {
    function place() {
      if (!anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const width = Math.min(384, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 12;
      const above = below < Math.min(280, window.innerHeight / 2) && rect.top > below;
      const maxHeight = Math.max(0, Math.min(window.innerHeight / 2, above ? rect.top - 12 : below));
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: above ? rect.top - 4 : rect.bottom + 4, maxHeight, above });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (anchor.current) observer.observe(anchor.current);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer.disconnect(); };
  }, [anchor]);

  const positioned = position.maxHeight > 0;
  useEffect(() => {
    if (positioned) search.current?.focus({ preventScroll: true });
  }, [positioned]);

  useLayoutEffect(() => {
    if (!pendingPinFocus.current) return;
    panel.current?.querySelector<HTMLButtonElement>(`[data-pin-model="${pendingPinFocus.current}"]`)?.focus({ preventScroll: true });
    pendingPinFocus.current = null;
  }, [pinned]);

  useEffect(() => {
    function outside(event: Event) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [anchor, onClose]);

  function select(modelId: Id) {
    const selected = selection.modelIds.includes(modelId);
    const multiple = !singleSelection && selection.multiple;
    const modelIds = multiple
      ? selected ? selection.modelIds.filter(id => id !== modelId) : [...selection.modelIds, modelId]
      : [modelId];
    if (!modelIds.length) return;
    onChange({ modelIds, autoSelect: false, multiple });
    if (!multiple) onClose(true);
  }

  function section(label: string, description: string, models: typeof filtered) {
    if (!models.length) return null;
    return <section className="image-model-section" aria-label={label}>
      <div className="image-model-section-heading">{label}<ImagePromptInfoTip label={label}>{description}</ImagePromptInfoTip></div>
      {models.map(model => <div className="image-model-row" key={model.id}>
        <button type="button" className="image-model-option" data-model-option aria-pressed={!selection.autoSelect && selection.modelIds.includes(model.id)}
          onClick={() => select(model.id)} title={model.description}>
          <span className="image-model-brand"><ImagePromptModelBrand brand={model.brand} /></span>
          <span className="image-model-copy">
            <span className="image-model-name-line"><span className="image-model-name">{model.name}</span>
              {model.isNew && <span className="image-model-new">新</span>}
              <span className="image-model-time">{model.channel ?? model.time}</span>
              <span className="image-model-capability" title={label === '选择文本模型' ? '文本输入' : '文生图'}><ImagePromptIcon name="model-text" /></span>
              <span className="image-model-capability" title={label === '选择文本模型' ? '图片输入' : '图生图'}><ImagePromptIcon name="model-image" /></span>
            </span>
            <span className="image-model-description">{model.description}</span>
          </span>
          {!selection.autoSelect && selection.modelIds.includes(model.id) && <ImagePromptIcon name="check" className="image-model-selected" />}
        </button>
        <button type="button" className="image-model-pin" data-pin-model={model.id} aria-label={`${pinned.includes(model.id) ? '取消置顶' : '置顶'} ${model.name}`} onClick={() => { pendingPinFocus.current = model.id; onPinnedChange(pinned.includes(model.id) ? pinned.filter(id => id !== model.id) : [...pinned, model.id]); }}>
          <ImagePromptIcon name={pinned.includes(model.id) ? 'pin-off' : 'pin'} />
        </button>
      </div>)}
    </section>;
  }

  return <Tooltip.Provider delayDuration={80} skipDelayDuration={100}>{createPortal(<div ref={panel} id={id} role="dialog" aria-labelledby={titleId} className="image-model-menu nodrag nopan nowheel"
    data-side={position.above ? 'top' : 'bottom'} style={{ left: position.left, top: position.top, maxHeight: position.maxHeight, visibility: position.maxHeight ? 'visible' : 'hidden' }}
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose(true); }
      if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      if (event.target === search.current && event.key !== 'ArrowDown') return;
      const options = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[data-model-option]') ?? [])];
      if (!options.length) return;
      event.preventDefault(); event.stopPropagation();
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
      options[index].focus();
    }}>
    <span id={titleId} className="image-model-sr-only">{label}</span>
    <div className="image-model-search"><ImagePromptIcon name="search" />
      <input ref={search} aria-label="搜索兼容模型" placeholder="搜索兼容模型" value={query} onChange={event => setQuery(event.target.value)} />
      <button type="button" aria-label="清空搜索" style={{ visibility: query ? 'visible' : 'hidden' }} onClick={() => { setQuery(''); search.current?.focus(); }}><ImagePromptIcon name="close" /></button>
    </div>
    {!singleSelection && <div className="image-model-settings">
      <div className="image-model-setting">
        <span><label htmlFor={autoSelectId}>自动选择模型</label><ImagePromptInfoTip label="自动选择模型">根据工作流自动选择最合适的模型。</ImagePromptInfoTip></span>
        <button id={autoSelectId} type="button" role="switch" aria-label="自动选择模型" aria-checked={selection.autoSelect} className="image-model-switch" onClick={() => onChange({ ...selection, autoSelect: !selection.autoSelect, multiple: false })}><span /></button>
      </div>
      <div className="image-model-setting">
        <span><label htmlFor={multipleId}>使用多个模型</label><ImagePromptInfoTip label="使用多个模型">{multipleHelp}</ImagePromptInfoTip></span>
        <button id={multipleId} type="button" role="switch" aria-label="使用多个模型" aria-checked={selection.multiple} className="image-model-switch" onClick={() => onChange({ ...selection, autoSelect: false, multiple: !selection.multiple, modelIds: selection.multiple ? selection.modelIds.slice(0, 1) : selection.modelIds })}><span /></button>
      </div>
    </div>}
    <div className="image-model-scroll">
      {section('已置顶模型', '收藏置顶的模型会显示在这里。', filtered.filter(model => pinned.includes(model.id)))}
      {section('推荐模型', '精选的推荐模型。', filtered.filter(model => !pinned.includes(model.id)))}
      {!filtered.length && <p className="image-model-empty" role="status">未找到兼容模型</p>}
    </div>
  </div>, document.body)}</Tooltip.Provider>;
}
