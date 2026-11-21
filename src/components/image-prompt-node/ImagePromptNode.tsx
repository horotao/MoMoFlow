import { ImagePromptModelBrand } from './ImagePromptModelMenu';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ImagePromptIcon } from './ImagePromptIcon';
import { ImagePromptHistory, type ImagePromptVariant } from './ImagePromptHistory';
import { ImagePromptReferences, type ImagePromptReference } from './ImagePromptReferences';
import { ImagePromptResult } from './ImagePromptResult';
import { ImagePromptToolbar } from './ImagePromptToolbar';
import { imagePromptModels, defaultImagePromptModelSelection, type ImagePromptModelSelection } from './imagePromptModels';
import { ImagePromptGeneration, type ImagePromptGenerationState } from './ImagePromptGeneration';
import { useMagneticPorts } from './useMagneticPorts';
import { useControllableValue } from './useControllableValue';
import './image-prompt-node.css';

function PortRing() {
  return <svg className="image-node-port" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3.818 4.036" transform="rotate(-100.94 12 12)" />
  </svg>;
}

// Match the reference handle shader's 24px plane: 22px ring and a
// round-capped 8px cross with a 2px stroke, independent of toolbar icons.
function OutputPortIcon() {
  return <svg className="image-node-output-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8M12 8v8" />
  </svg>;
}

export interface ImagePromptNodeProps {
  assetOnly?: boolean;
  /** Canvas connection handles share the visual port hit areas. */
  handles?: { image: ReactNode; output: ReactNode };
  promptReadOnly?: boolean;
  prompt?: string;
  defaultPrompt?: string;
  onPromptChange?: (prompt: string) => void;
  quantity?: number;
  defaultQuantity?: number;
  onQuantityChange?: (quantity: number) => void;
  selected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  locked?: boolean;
  defaultLocked?: boolean;
  onLockedChange?: (locked: boolean) => void;
  title?: string;
  modelLabel?: string;
  modelSelection?: ImagePromptModelSelection;
  defaultModelSelection?: ImagePromptModelSelection;
  onModelSelectionChange?: (selection: ImagePromptModelSelection) => void;
  aspectRatio?: string;
  defaultAspectRatio?: string;
  onAspectRatioChange?: (ratio: string) => void;
  suggestion?: string;
  className?: string;
  /** undefined uses the default toolbar; null hides it. */
  toolbar?: ReactNode;
  generation?: ImagePromptGenerationState | null;
  result?: ReactNode;
  /** Optional result history; the host owns which result is displayed. */
  variants?: readonly ImagePromptVariant[];
  activeVariant?: number;
  onVariantChange?: (index: number) => void;
  onGenerate?: (request: { prompt: string; quantity: number }) => void;
  onMention?: () => void;
  onDictate?: () => void;
  onEnhance?: () => void;
  onImageInput?: () => void;
  onAddConnectedNode?: () => void;
  /** Frontend connection hosts may report their current port occupancy. */
  imageInputCount?: number;
  references?: readonly ImagePromptReference[];
  onRemoveReference?: (id: string) => void;
  onReorderReferences?: (ids: string[]) => void;
  referenceScale?: number;
  outputConnected?: boolean;
}

export function ImagePromptNode({
  assetOnly = false, handles, promptReadOnly, prompt: promptValue, defaultPrompt = '', onPromptChange,
  quantity: quantityValue, defaultQuantity = 1, onQuantityChange,
  selected: selectedValue, defaultSelected = false, onSelectedChange,
  locked: lockedValue, defaultLocked = false, onLockedChange,
  title = 'Image', modelLabel, modelSelection, defaultModelSelection = defaultImagePromptModelSelection, onModelSelectionChange, aspectRatio: aspectRatioValue, defaultAspectRatio = '1:1', onAspectRatioChange,
  suggestion = 'Oil paint macro, impasto texture', className = '', toolbar, generation = null, result, variants = [], activeVariant = 0, onVariantChange,
  onGenerate, onMention, onDictate, onEnhance, onImageInput, onAddConnectedNode, imageInputCount = 0,
  references = [], onRemoveReference, onReorderReferences, referenceScale = 1, outputConnected = false,
}: ImagePromptNodeProps) {
  const [aspectRatio, setAspectRatio] = useControllableValue(aspectRatioValue, defaultAspectRatio, onAspectRatioChange);
  const [selection, setSelection] = useControllableValue(modelSelection, defaultModelSelection, onModelSelectionChange);
  const activeModel = imagePromptModels.find(model => model.id === selection.modelIds[0]);
  const displayModelLabel = modelLabel ?? (selection.autoSelect ? '自动选择模型' : selection.modelIds.length > 1 ? `${selection.modelIds.length} 个模型` : activeModel?.name);
  const [prompt, setPrompt] = useControllableValue(promptValue, defaultPrompt, onPromptChange);
  const [selected, setSelected] = useControllableValue(selectedValue, defaultSelected, onSelectedChange);
  const [locked, setLocked] = useControllableValue(lockedValue, defaultLocked, onLockedChange);
  const [quantity, updateQuantity] = useControllableValue(quantityValue, defaultQuantity, onQuantityChange);
  function setQuantity(value: number) { updateQuantity(Math.max(1, Math.min(20, Math.trunc(value) || 1))); }
  const [toolbarHovered, setToolbarHovered] = useState(false);
  const toolbarHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editor = useRef<HTMLTextAreaElement>(null);
  const promptScroll = useRef<HTMLDivElement>(null);
  const [contentOverflows, setContentOverflows] = useState(false);
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number; open: boolean } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipExitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipWarmUntil = useRef(0);
  const hasPrompt = Boolean(prompt.trim());
  const busy = generation !== null;
  const hasResult = Boolean(result);
  const resultElement = useRef<HTMLDivElement>(null);
  const activeVariantId = variants[activeVariant]?.id;
  const previousResult = useRef({ busy, activeVariantId });
  useLayoutEffect(() => {
    const previous = previousResult.current;
    previousResult.current = { busy, activeVariantId };
    // Generation completion reveals the whole result. History navigation has
    // its own crossfade between images, handled by ImagePromptResult.
    if (!previous.busy || busy || previous.activeVariantId !== activeVariantId || !hasResult) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const element = resultElement.current;
    if (!element || reduced.matches) return;
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 400, easing: 'cubic-bezier(.333333, 0, .666667, 1)',
    });
    const stop = () => { if (reduced.matches) animation.cancel(); };
    reduced.addEventListener('change', stop);
    return () => {
      animation.cancel();
      reduced.removeEventListener('change', stop);
    };
  }, [busy, activeVariantId, hasResult]);
  const compactComposer = busy || hasResult;
  const hasReferences = !assetOnly && references.length > 0;
  const ports = useMagneticPorts();
  const referenceStrip = hasReferences && <ImagePromptReferences references={references} onRemove={locked ? undefined : onRemoveReference}
    onReorder={locked ? undefined : onReorderReferences} scale={referenceScale}
    restoreFocus={() => ports.node.current?.focus({ preventScroll: true })} />;

  useEffect(() => () => {
    clearTimeout(toolbarHideTimer.current);
    clearTimeout(tooltipTimer.current);
    clearTimeout(tooltipExitTimer.current);
  }, []);

  function hideTooltip() {
    clearTimeout(tooltipTimer.current);
    clearTimeout(tooltipExitTimer.current);
    setTooltip(current => current ? { ...current, open: false } : null);
    tooltipExitTimer.current = setTimeout(() => setTooltip(null), 80);
  }

  function showTooltip(target: HTMLElement, instant = false) {
    const label = target.dataset.tooltip;
    if (!label) return;
    clearTimeout(tooltipTimer.current);
    clearTimeout(tooltipExitTimer.current);
    const open = () => {
      const rect = target.getBoundingClientRect();
      tooltipWarmUntil.current = Number.POSITIVE_INFINITY;
      setTooltip({ label, x: rect.left + rect.width / 2, y: rect.top - 4, open: true });
    };
    if (instant || performance.now() < tooltipWarmUntil.current) open();
    else tooltipTimer.current = setTimeout(open, 80);
  }

  function leaveTooltip() {
    if (tooltipWarmUntil.current === Number.POSITIVE_INFINITY) tooltipWarmUntil.current = performance.now() + 100;
    hideTooltip();
  }

  function tooltipProps(label: string) {
    return { 'data-tooltip': label, 'aria-describedby': tooltip?.open && tooltip.label === label ? tooltipId : undefined };
  }

  useLayoutEffect(() => {
    const field = editor.current;
    const scroller = promptScroll.current;
    if (!field || !scroller) return;
    let disposed = false;

    function measure() {
      if (disposed || !field || !scroller) return;
      if (scroller.clientHeight === 0) return;
      const previousTop = scroller.scrollTop;
      const previousMax = scroller.scrollHeight - scroller.clientHeight;
      const wasAtBottom = previousMax > 1 && previousTop >= previousMax - 1;
      const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight);
      field.style.height = '0px';
      // A scrollbar narrows the text by 15px. Measure again after it appears
      // so the outer viewport owns all scrolling, including its bottom padding.
      for (let pass = 0; pass < 2; pass++) {
        const lines = Math.max(1, Math.round(field.scrollHeight / lineHeight));
        field.style.height = `${lines * lineHeight}px`;
      }
      const maximum = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = wasAtBottom ? maximum : Math.min(previousTop, maximum);
      setContentOverflows(maximum > 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    void document.fonts.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); };
  }, [prompt, compactComposer]);

  function enterToolbarHover() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    clearTimeout(toolbarHideTimer.current);
    setToolbarHovered(true);
  }

  function leaveToolbarHover() {
    clearTimeout(toolbarHideTimer.current);
    // The reference keeps hover chrome alive for 75ms when leaving the node.
    toolbarHideTimer.current = setTimeout(() => setToolbarHovered(false), 75);
  }

  return (
    <>
      <section
        ref={ports.node}
        className={`image-node${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}${contentOverflows ? ' is-overflowing' : ''}${hasResult ? ' has-result' : ''}${compactComposer ? ' has-compact-composer' : ''}${hasReferences ? ' has-reference-images' : ''} ${className}`}
        aria-label={title}
        aria-busy={busy}
        tabIndex={hasReferences ? -1 : undefined}
        data-toolbar-hovered={toolbarHovered || undefined}
        onPointerEnter={enterToolbarHover}
        onPointerLeave={leaveToolbarHover}
        onFocus={() => setSelected(true)}
        onPointerDown={() => setSelected(true)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            leaveTooltip();
            setSelected(false);
            if (ports.node.current?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
          }
        }}
      >
        {toolbar !== null && <div className="image-node-toolbar-bridge">
          {toolbar ?? <ImagePromptToolbar modelLabel={modelLabel} modelSelection={selection} onModelSelectionChange={setSelection} aspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} locked={locked} onLockedChange={setLocked} />}
        </div>}

        <header className="image-node-heading">
          <h1 title={title}><ImagePromptIcon name="image" /><span>{title}</span></h1>
          {!assetOnly && <span className="image-node-model">{busy && Number.isFinite(generation.estimatedSeconds) && (generation.estimatedSeconds ?? 0) > 0
            ? <span className="image-node-estimate">~{Math.round(generation.estimatedSeconds!)}s</span>
            : <><ImagePromptModelBrand brand={activeModel?.brand ?? 'openai'} /><span title={displayModelLabel}>{displayModelLabel}</span></>}</span>}
        </header>

        <div className="image-node-card" onClick={() => { if (!locked && !busy && !hasResult) editor.current?.focus(); }}>
          {hasResult && !busy && <div ref={resultElement} className="image-node-result"><ImagePromptResult variantId={activeVariantId}>{result}</ImagePromptResult></div>}
          {!assetOnly && <div className="image-node-surface">
            <div className="image-node-surface-body">
            {compactComposer && referenceStrip}
            <div ref={promptScroll} className="image-node-composer nowheel" onWheel={event => event.stopPropagation()}>
              <textarea ref={editor} rows={1} value={prompt} readOnly={locked || promptReadOnly} spellCheck aria-label="Chat message" onChange={event => setPrompt(event.currentTarget.value)} onKeyDown={event => {
                if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing && !prompt && !locked && !promptReadOnly) {
                  event.preventDefault();
                  setPrompt(suggestion);
                }
              }} />
              {!prompt && <div className="image-node-suggestion" aria-hidden="true"><span className="image-node-suggestion-label">Try "{suggestion}"</span><kbd>tab</kbd></div>}
            </div>

            <div className="image-node-footer">
            {!compactComposer && referenceStrip}

            <div className="image-node-actions" onClick={event => event.stopPropagation()}
              onPointerOver={event => {
                if (event.pointerType === 'touch' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
                const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tooltip]');
                if (target && (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget))) showTooltip(target);
              }}
              onPointerOut={event => {
                const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tooltip]');
                if (target && (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget))) leaveTooltip();
              }}
              onFocusCapture={event => showTooltip(event.target as HTMLElement, true)}
              onBlurCapture={leaveTooltip}
              onPointerDownCapture={leaveTooltip}
            >
              <button type="button" aria-label="Mention node" onClick={onMention} {...tooltipProps('Mention node')} disabled={locked}><ImagePromptIcon name="mention" /></button>
              <button type="button" aria-label="Reference Element" {...tooltipProps('No Elements available')} disabled><ImagePromptIcon name="hash" /></button>
              <div className="image-node-actions-right">
                <button type="button" aria-label="Dictate prompt" onClick={onDictate} {...tooltipProps('Dictate prompt')} disabled={locked}><ImagePromptIcon name="mic" /></button>
                <button type="button" aria-label="Enhance prompt" onClick={onEnhance} {...tooltipProps('Enhance prompt')} disabled={!hasPrompt || locked}><ImagePromptIcon name="enhance" /></button>
                <div className={`image-node-generate-group${quantity > 1 ? ' is-expanded' : ''}${hasPrompt && !locked ? '' : ' is-disabled'}`}>
                  <div className="image-node-quantity">
                    <button type="button" aria-label="Decrease quantity" disabled={!hasPrompt || locked || quantity <= 1} onClick={() => setQuantity(quantity - 1)}><ImagePromptIcon name="minus" /></button>
                    <input aria-label="Quantity" role="spinbutton" aria-valuemin={1} aria-valuemax={20} aria-valuenow={quantity} inputMode="numeric" value={quantity} disabled={!hasPrompt || locked} onChange={event => setQuantity(Math.max(1, Math.min(20, Number(event.currentTarget.value) || 1)))} />
                    <button type="button" aria-label="Increase quantity" disabled={!hasPrompt || locked || quantity >= 20} onClick={() => setQuantity(quantity + 1)}><ImagePromptIcon name="plus" /></button>
                  </div>
                  <button className="image-node-generate" type="button" aria-label="Generate" onClick={() => onGenerate?.({ prompt, quantity })} disabled={!hasPrompt || locked}><ImagePromptIcon name="generate" /></button>
                </div>
              </div>
            </div>
            </div>
            </div>
          </div>}
          <ImagePromptGeneration state={generation} />
        </div>

        <ImagePromptHistory variants={variants} activeVariant={activeVariant} onVariantChange={onVariantChange} />

        <div className="image-node-ports">
          {!assetOnly && <div className="image-node-inputs">
            <button ref={ports.input} data-connection-port="image" data-connected={imageInputCount > 0 || undefined} disabled={locked} type="button" className="image-node-input" aria-label="Image input" onClick={onImageInput}>
              <span className="image-node-port-label"><span className="image-node-port-icon image-node-port-icon-image" aria-hidden="true" />Image <span className="image-node-port-count">{imageInputCount}/16</span></span><PortRing />{handles?.image}
            </button>
          </div>}
          <button ref={ports.output} data-connection-port="output" data-connected={outputConnected || undefined} disabled={locked} type="button" className="image-node-output" aria-label="Add connected node" onClick={onAddConnectedNode}>
            <span className="image-node-output-visual"><OutputPortIcon /></span>{handles?.output}
          </button>
        </div>
      </section>
      {tooltip && createPortal(
        <div className="image-node-tooltip-position" style={{ left: tooltip.x, top: tooltip.y }}>
          <div id={tooltipId} role="tooltip" className="image-node-tooltip" data-state={tooltip.open ? 'open' : 'closed'}>{tooltip.label}</div>
        </div>, document.body,
      )}
    </>
  );
}
