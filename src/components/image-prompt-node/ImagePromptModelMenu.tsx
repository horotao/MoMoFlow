import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ImagePromptInfoTip } from './ImagePromptInfoTip';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-prompt-model-menu.css';

export function ImagePromptModelBrand({ brand }: { brand: string }) {
  if (brand === 'openai') return <ImagePromptIcon name="model-openai" />;
  const src = modelBrandSources[brand] ?? modelBrandSources.google;
  return <img className="image-model-logo" src={src} alt="" />;
}

const modelBrandSources: Record<string, string> = {
  suno: new URL('./assets/suno.svg', import.meta.url).href,
  deepseek: new URL('./assets/deepseek.svg', import.meta.url).href,
  minimax: new URL('./assets/minimax.svg', import.meta.url).href,
  bytedance: new URL('./assets/bytedance.svg', import.meta.url).href,
  google: new URL('./assets/google.svg', import.meta.url).href,
  grok: new URL('./assets/grok.svg', import.meta.url).href,
  kling: new URL('./assets/kling.svg', import.meta.url).href,
};

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
  groups?: { featured: readonly Id[]; providers: Readonly<Record<string, string>> };
  multipleHelp?: string;
}

export function ImagePromptModelMenu<Id extends string>({ id, anchor, models, label = '选择图像模型', selection, onChange, pinned, onPinnedChange, onClose, groups, singleSelection = false,
  multipleHelp = '第一个选中的模型在当前节点生成，其余模型分别新建节点。' }: ModelMenuProps<Id>) {
  const panel = useRef<HTMLDivElement>(null);
  const providerPanel = useRef<HTMLDivElement>(null);
  const [provider, setProvider] = useState<string>();
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
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !providerPanel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose();
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

  function section(heading: string, description: string, models: typeof filtered) {
    if (!models.length) return null;
    return <section className="image-model-section" aria-label={heading}>
      <div className="image-model-section-heading">{heading}<ImagePromptInfoTip label={heading}>{description}</ImagePromptInfoTip></div>
      {models.map(model => <div className="image-model-row" key={model.id}>
        <button type="button" className="image-model-option" data-model-option aria-pressed={!selection.autoSelect && selection.modelIds.includes(model.id)}
          onClick={() => select(model.id)} title={model.description}>
          <span className="image-model-brand"><ImagePromptModelBrand brand={model.brand} /></span>
          <span className="image-model-copy">
            <span className="image-model-name-line"><span className="image-model-name">{model.name}</span>
              {model.isNew && <span className="image-model-new">新</span>}
              {model.time && <span className="image-model-time" title="预计生成时间">{model.time}</span>}
              {!model.time && model.channel && <span className="image-model-time">{model.channel}</span>}
              <span className="image-model-capability" title={label === '选择图像模型' ? '文生图' : '文本输入'}><ImagePromptIcon name="model-text" /></span>
              {!groups && <span className="image-model-capability" title={label === '选择图像模型' ? '图生图' : '图片输入'}><ImagePromptIcon name="model-image" /></span>}
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
      {groups && !query.trim() ? <>
        {!pinned.length && <section><div className="image-model-section-heading">已置顶模型</div><p className="model-pins-empty">收藏的模型将显示在这里</p></section>}
        {section('推荐模型', '精选的推荐模型。', filtered.filter(model => groups.featured.includes(model.id)))}
        {Object.keys(groups.providers).length > 0 && <div className="image-model-section-heading">提供商</div>}
        {Object.entries(groups.providers).map(([brand, name]) => <Menu.Root key={brand} modal={false} open={provider === brand}
          onOpenChange={open => setProvider(open ? brand : undefined)}>
          <Menu.Trigger asChild><button type="button" data-model-option className="model-provider-trigger"
            onPointerEnter={e => { if (e.pointerType === 'mouse') setProvider(brand); }}
            onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); setProvider(brand); } }}>
            <ImagePromptModelBrand brand={brand} />{name}<ImagePromptIcon name="chevron" /></button></Menu.Trigger>
          <Menu.Portal><Menu.Content ref={providerPanel} className="image-model-menu model-provider-panel nodrag nopan nowheel" side="right" align="start"
            sideOffset={2} collisionPadding={8} aria-label={name} onWheel={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
            onCloseAutoFocus={e => e.preventDefault()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'ArrowLeft') setProvider(undefined); }}>
            {filtered.filter(model => model.brand === brand).map(model => <div className="image-model-row" key={model.id}>
              <Menu.Item asChild onSelect={() => select(model.id)}><button type="button" className="image-model-option">
                <span className="image-model-brand"><ImagePromptModelBrand brand={brand} /></span>
                <span className="image-model-copy"><span className="image-model-name-line"><span className="image-model-name">{model.name}</span>
                  <span className="image-model-time">{model.time}</span></span><span className="image-model-description">{model.description}</span></span>
                {selection.modelIds.includes(model.id) && <ImagePromptIcon name="check" className="image-model-selected" />}
              </button></Menu.Item>
              <Menu.Item asChild onSelect={e => { e.preventDefault(); onPinnedChange(pinned.includes(model.id) ? pinned.filter(id => id !== model.id) : [...pinned, model.id]); }}>
                <button type="button" className="image-model-pin" aria-label={(pinned.includes(model.id) ? '取消置顶 ' : '置顶 ') + model.name}>
                  <ImagePromptIcon name={pinned.includes(model.id) ? 'pin-off' : 'pin'} /></button></Menu.Item>
            </div>)}
          </Menu.Content></Menu.Portal>
        </Menu.Root>)}
        {section('模型', '其他可用模型。', filtered.filter(model => !groups.featured.includes(model.id) && !(model.brand in groups.providers)))}
      </> : section(query.trim() && groups ? '模型' : '推荐模型', '可用的模型。', filtered.filter(model => !pinned.includes(model.id)))}
      {!filtered.length && <p className="image-model-empty" role="status">未找到兼容模型</p>}
    </div>
  </div>, document.body)}</Tooltip.Provider>;
}
