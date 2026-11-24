import { useNodeColorTags } from '../CanvasColorTagContext';
import { colorTags, nodeTagHighlight } from '../../nodes/colorTags';
import { NodeColorGlow } from '../NodeColorGlow';
import { PromptMentionEditor, type PromptMentionEditorHandle } from './PromptMentionEditor';
import type { PromptMention } from '../../nodes/types';
import type { MentionCandidate, MentionEdit, MentionSources } from '../../nodes/promptMentions';
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
import { ImagePromptGenerateControl } from './ImagePromptGenerateControl';
import { useMagneticPorts } from './useMagneticPorts';
import { useControllableValue } from './useControllableValue';
import { InputPortRing } from './InputPortRing';
import { ImageNodeTitle } from './ImageNodeTitle';
import './image-prompt-node.css';

// Match the reference handle shader's 24px plane: 22px ring and a
// round-capped 8px cross with a 2px stroke, independent of toolbar icons.
function OutputPortIcon() {
  return <svg className="image-node-output-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8M12 8v8" />
  </svg>;
}

export interface ImagePromptNodeProps {
  kind?: 'image' | 'text';
  textResult?: ReactNode;
  textFormat?: 'txt' | 'md';
  onTextFormatChange?: (format: 'txt' | 'md') => void;
  textInput?: ReactNode;
  assetOnly?: boolean;
  /** Canvas connection handles share the visual port hit areas. */
  handles?: { image: ReactNode; output: ReactNode };
  promptReadOnly?: boolean;
  prompt?: string;
  defaultPrompt?: string;
  onPromptChange?: (prompt: string) => void;
  quantity?: number;
  quantityRange?: { min: number; max: number };
  defaultQuantity?: number;
  onQuantityChange?: (quantity: number) => void;
  selected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  locked?: boolean;
  defaultLocked?: boolean;
  onLockedChange?: (locked: boolean) => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  modelLabel?: string;
  modelBrand?: string;
  editModeLabel?: string;
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
  onPreviewImage?: () => void;
  /** Optional result history; the host owns which result is displayed. */
  variants?: readonly ImagePromptVariant[];
  activeVariant?: number;
  onVariantChange?: (index: number) => void;
  onGenerate?: (request: { prompt: string; quantity: number }) => void;
  onCancelGeneration?: () => void;
  canGenerateWithoutPrompt?: boolean;
  onMention?: () => void;
  promptMentions?: readonly PromptMention[];
  mentionCandidates?: readonly MentionCandidate[];
  onMentionEdit?: (edit: MentionEdit, sourceId?: MentionSources) => boolean;
  onDictate?: () => void;
  onEnhance?: () => void;
  onImageInput?: () => void;
  onAddConnectedNode?: () => void;
  /** Frontend connection hosts may report their current port occupancy. */
  imageInputCount?: number;
  imageInputLimit?: number;
  references?: readonly ImagePromptReference[];
  onRemoveReference?: (id: string) => void;
  onReorderReferences?: (ids: string[]) => void;
  referenceScale?: number;
  outputConnected?: boolean;
}

export function ImagePromptNode({
  kind = 'image', textResult, textFormat = 'txt', onTextFormatChange, textInput,
  assetOnly = false, handles, promptReadOnly, prompt: promptValue, defaultPrompt = '', onPromptChange,
  quantity: quantityValue, defaultQuantity = 1, onQuantityChange, quantityRange,
  selected: selectedValue, defaultSelected = false, onSelectedChange,
  locked: lockedValue, defaultLocked = false, onLockedChange,
  title = 'Image', onTitleChange, modelLabel, modelBrand, editModeLabel, modelSelection, defaultModelSelection = defaultImagePromptModelSelection, onModelSelectionChange, aspectRatio: aspectRatioValue, defaultAspectRatio = '1:1', onAspectRatioChange,
  suggestion = 'Oil paint macro, impasto texture', className = '', toolbar, generation = null, result, onPreviewImage, variants = [], activeVariant = 0, onVariantChange,
  onGenerate, onCancelGeneration, canGenerateWithoutPrompt = false, onMention, onDictate, onEnhance, onImageInput, onAddConnectedNode, imageInputCount = 0, imageInputLimit = 16,
  promptMentions, mentionCandidates, onMentionEdit,
  references = [], onRemoveReference, onReorderReferences, referenceScale = 1, outputConnected = false,
}: ImagePromptNodeProps) {
  const nodeTags = useNodeColorTags();
  const tags = colorTags.filter(tag => nodeTags.tags?.includes(tag.id));
  const highlight = nodeTagHighlight(nodeTags.tags ?? [], nodeTags.active);
  const [aspectRatio, setAspectRatio] = useControllableValue(aspectRatioValue, defaultAspectRatio, onAspectRatioChange);
  const [selection, setSelection] = useControllableValue(modelSelection, defaultModelSelection, onModelSelectionChange);
  const activeModel = imagePromptModels.find(model => model.id === selection.modelIds[0]);
  const displayModelLabel = modelLabel ?? (selection.autoSelect ? '自动选择模型' : selection.modelIds.length > 1 ? `${selection.modelIds.length} 个模型` : activeModel?.name);
  const [prompt, setPrompt] = useControllableValue(promptValue, defaultPrompt, onPromptChange);
  const [selected, setSelected] = useControllableValue(selectedValue, defaultSelected, onSelectedChange);
  const [locked, setLocked] = useControllableValue(lockedValue, defaultLocked, onLockedChange);
  const [quantity, updateQuantity] = useControllableValue(quantityValue, defaultQuantity, onQuantityChange);
  const [toolbarHovered, setToolbarHovered] = useState(false);
  const toolbarHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editor = useRef<PromptMentionEditorHandle>(null);
  const promptScroll = useRef<HTMLDivElement>(null);
  const [contentOverflows, setContentOverflows] = useState(false);
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number; open: boolean } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipExitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipWarmUntil = useRef(0);
  const hasPrompt = Boolean(prompt.trim());
  const busy = generation !== null;
  const canGenerate = hasPrompt || canGenerateWithoutPrompt;
  const cancelGeneration = busy ? onCancelGeneration : undefined;
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
  const isText = kind === 'text';
  const hasTextOutput = isText && (busy || Boolean(textResult));
  const compactComposer = !isText && (busy || hasResult);
  const referencesAbovePrompt = compactComposer || hasTextOutput;
  const quantityEnabled = hasPrompt || (isText && canGenerateWithoutPrompt);
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
    const field = promptScroll.current?.querySelector<HTMLElement>('.image-node-prompt-editor');
    const scroller = promptScroll.current;
    if (!field || !scroller) return;
    let disposed = false;

    function measure() {
      if (disposed || !field || !scroller) return;
      if (scroller.clientHeight === 0) return;
      const previousTop = scroller.scrollTop;
      const previousMax = scroller.scrollHeight - scroller.clientHeight;
      const wasAtBottom = previousMax > 1 && previousTop >= previousMax - 1;
      const maximum = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = wasAtBottom ? maximum : Math.min(previousTop, maximum);
      setContentOverflows(maximum > 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(field);
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
        className={`image-node${textInput ? ' has-text-input' : ''}${promptReadOnly && !isText ? ' has-connected-prompt' : ''}${isText ? ' text-node' : ''}${hasTextOutput ? ' has-text-output' : ''}${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}${contentOverflows ? ' is-overflowing' : ''}${hasResult ? ' has-result' : ''}${compactComposer ? ' has-compact-composer' : ''}${hasReferences ? ' has-reference-images' : ''} ${className}`}
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

        {highlight && <NodeColorGlow color={highlight} zoom={nodeTags.zoom} selected={selected} />}
        <header className="image-node-heading">
          <h1><ImagePromptIcon name={isText ? 'text' : 'image'} /><ImageNodeTitle title={title} editable={selected} locked={locked} onChange={onTitleChange} /></h1>
          {editModeLabel ? <span className="image-node-model"><span title={editModeLabel}>{editModeLabel}</span></span> : !assetOnly && <span className="image-node-model">{busy && Number.isFinite(generation.estimatedSeconds) && (generation.estimatedSeconds ?? 0) > 0
            ? <span className="image-node-estimate">~{Math.round(generation.estimatedSeconds!)}s</span>
            : <><ImagePromptModelBrand brand={modelBrand ?? activeModel?.brand ?? 'openai'} /><span title={displayModelLabel}>{displayModelLabel}</span></>}</span>}
          {tags.length > 0 && <span className="node-heading-tags" aria-label="节点颜色标记">{tags.map(tag => <span key={tag.id} className="node-tag-dot" style={{ background: tag.color }} title={tag.label} />)}</span>}
        </header>

        <div className="image-node-card" onClick={event => { if (!locked && !busy && !hasResult && !(event.target as HTMLElement).closest('.text-node-output, .image-node-prompt-editor')) editor.current?.focus(); }}>
          {hasResult && !busy && <div ref={resultElement} className="image-node-result" onDoubleClickCapture={event => {
            if (onPreviewImage) { event.preventDefault(); event.stopPropagation(); onPreviewImage(); }
          }}><ImagePromptResult variantId={activeVariantId}>{result}</ImagePromptResult></div>}
          {!assetOnly && <div className="image-node-surface">
            <div className="image-node-surface-body">
            {referencesAbovePrompt && referenceStrip}
            <div ref={promptScroll} className="image-node-composer nowheel" onWheel={event => event.stopPropagation()}>
              <PromptMentionEditor ref={editor} kind={kind} prompt={prompt} mentions={promptMentions} candidates={mentionCandidates}
                readOnly={locked || promptReadOnly} suggestion={suggestion} onChange={setPrompt} onEdit={onMentionEdit} />
              {!prompt && !promptReadOnly && <div className="image-node-suggestion" aria-hidden="true"><span className="image-node-suggestion-label">Try "{suggestion}"</span><kbd>tab</kbd></div>}
            </div>

            {hasTextOutput && <div className="text-node-output nowheel nodrag nopan" onWheel={event => event.stopPropagation()}>{textResult}</div>}

            <div className="image-node-footer">
            {!referencesAbovePrompt && referenceStrip}

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
              <button type="button" aria-label="Mention node" onPointerDown={event => event.preventDefault()} onClick={() => { hideTooltip(); editor.current?.mention(); onMention?.(); }} {...tooltipProps('Mention node')} disabled={locked || promptReadOnly}><ImagePromptIcon name="mention" /></button>
              {isText ? <button type="button" aria-label="Connected apps" aria-disabled="true" {...tooltipProps('Connected apps')}><ImagePromptIcon name="plug" /></button>
                : <button type="button" aria-label="Reference Element" {...tooltipProps('No Elements available')} disabled><ImagePromptIcon name="hash" /></button>}
              <div className="image-node-actions-right">
                {isText ? <div className="text-node-formats" role="group" aria-label="Output format">
                  {(['txt', 'md'] as const).map(format => <button type="button" key={format} aria-pressed={format === textFormat} disabled={locked} onClick={() => onTextFormatChange?.(format)}>{format.toUpperCase()}</button>)}
                </div> : <button type="button" aria-label="Dictate prompt" onClick={onDictate} {...tooltipProps('Dictate prompt')} disabled={locked || promptReadOnly}><ImagePromptIcon name="mic" /></button>}
                <button type="button" aria-label="Enhance prompt" onClick={onEnhance} {...tooltipProps('Enhance prompt')} disabled={!hasPrompt || locked || promptReadOnly}><ImagePromptIcon name="enhance" /></button>
                <ImagePromptGenerateControl quantity={quantity} quantityRange={quantityRange} onQuantityChange={updateQuantity}
                  canChangeQuantity={quantityEnabled && !locked} canExpand={canGenerate && !locked}
                  canSend={(canGenerate && !locked) || Boolean(cancelGeneration)}
                  sendLabel={cancelGeneration ? 'Cancel generation' : 'Generate'}
                  onSend={() => cancelGeneration ? cancelGeneration() : onGenerate?.({ prompt, quantity })} />
              </div>
            </div>
            </div>
            </div>
          </div>}
          <ImagePromptGeneration state={generation} borderOnly={isText} />
        </div>

        <ImagePromptHistory variants={variants} activeVariant={activeVariant} onVariantChange={onVariantChange} />

        <div className="image-node-ports">
          {!assetOnly && <div className="image-node-inputs">
            {textInput && <div ref={element => { ports.textInput.current = element?.querySelector('button') ?? null; }}>{textInput}</div>}
            <button ref={ports.input} data-connection-port="image" data-connected={imageInputCount > 0 || undefined} disabled={locked} type="button" className="image-node-input" aria-label="Image input" onClick={onImageInput}>
              <span className="image-node-port-label"><span className="image-node-port-icon image-node-port-icon-image" aria-hidden="true" />Image <span className="image-node-port-count">{imageInputCount}/{imageInputLimit}</span></span><InputPortRing />{handles?.image}
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
