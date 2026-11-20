import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './image-prompt-node.css';

const example = 'Oil paint macro, impasto texture';

// These SVGs and the font come from the reference page, not an icon/component library.
function Icon({ name, className = '' }: { name: string; className?: string }) {
  const url = name === 'openai' ? '/canvas-menu/openai.svg' : new URL(`./image-prompt-assets/${name}.svg`, import.meta.url).href;
  return <span aria-hidden="true" className={`image-node-icon ${className}`} style={{ maskImage: `url("${url}")` }} />;
}

// FLORA's rendered handle geometry: 160-unit attraction radius, 35% pull,
// capped at 20 units, retargeted from the current position over 500ms (easeOutCubic).
// Magnetic movement and the separate 150ms reveal never share a transform.
function useMagneticPorts() {
  const node = useRef<HTMLElement>(null);
  const inputs = useRef<(HTMLButtonElement | null)[]>([]);
  const output = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const tracks = Array.from({ length: 3 }, () => ({
      x: 0, y: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, started: 0,
    }));
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;

    function advance(track: typeof tracks[number], now: number) {
      const progress = reduced.matches ? 1 : Math.min(1, Math.max(0, (now - track.started) / 500));
      const eased = 1 - (1 - progress) ** 3;
      track.x = track.fromX + (track.toX - track.fromX) * eased;
      track.y = track.fromY + (track.toY - track.fromY) * eased;
      return progress < 1;
    }

    function paint(now: number) {
      frame = 0;
      let moving = false;
      const elements = [...inputs.current, output.current];
      tracks.forEach((track, index) => {
        moving = advance(track, now) || moving;
        const element = elements[index];
        if (element) element.style.transform = `translate3d(${track.x}px, ${track.y}px, 0)`;
      });
      if (moving) frame = requestAnimationFrame(paint);
    }

    function retarget() {
      const rect = node.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = rect.width / 384;
      const anchors = [
        { x: -24, y: 172 },
        { x: -24, y: 212 },
        { x: 412, y: 192 },
      ];
      const now = performance.now();
      tracks.forEach((track, index) => {
        advance(track, now);
        let x = 0;
        let y = 0;
        if (pointer && finePointer.matches) {
          const dx = (pointer.x - rect.left) / scale - anchors[index].x;
          const dy = (pointer.y - rect.top) / scale - anchors[index].y;
          if (Math.hypot(dx, dy) < 160) {
            x = dx * .35;
            y = dy * .35;
            const length = Math.hypot(x, y);
            if (length > 20) { x *= 20 / length; y *= 20 / length; }
          }
        }
        if (track.toX === x && track.toY === y) return;
        track.fromX = track.x;
        track.fromY = track.y;
        track.toX = x;
        track.toY = y;
        track.started = now;
      });
      if (!frame) paint(now);
    }

    function move(event: PointerEvent) {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      pointer = { x: event.clientX, y: event.clientY };
      retarget();
    }
    function leave() { pointer = null; retarget(); }
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('resize', retarget);
    window.addEventListener('scroll', retarget, { passive: true, capture: true });
    reduced.addEventListener('change', retarget);
    finePointer.addEventListener('change', retarget);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', retarget);
      window.removeEventListener('scroll', retarget, true);
      reduced.removeEventListener('change', retarget);
      finePointer.removeEventListener('change', retarget);
    };
  }, []);

  return { node, inputs, output };
}

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

export function ImagePromptNode() {
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState(false);
  const [locked, setLocked] = useState(false);
  const [quantity, setQuantity] = useState(1);
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
  const ports = useMagneticPorts();

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
      const previousTop = scroller.scrollTop;
      const previousMax = scroller.scrollHeight - scroller.clientHeight;
      const wasAtBottom = previousMax > 1 && previousTop >= previousMax - 1;
      const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight);
      field.style.height = '0px';
      // A scrollbar narrows the text by 15px. Measure again after it appears
      // so the outer viewport owns all scrolling, including the 144px tail.
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
  }, [prompt]);

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
    <main className="prototype-stage" onPointerDown={event => {
      if (event.target === event.currentTarget) {
        setSelected(false);
        editor.current?.blur();
      }
    }} onKeyDown={event => {
      if (event.key === 'Escape') {
        leaveTooltip();
        setSelected(false);
        (document.activeElement as HTMLElement)?.blur();
      }
    }}>
      <section
        ref={ports.node}
        className={`image-node${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}${contentOverflows ? ' is-overflowing' : ''}`}
        aria-label="Image node"
        data-toolbar-hovered={toolbarHovered || undefined}
        onPointerEnter={enterToolbarHover}
        onPointerLeave={leaveToolbarHover}
        onFocus={() => setSelected(true)}
        onPointerDown={() => setSelected(true)}
      >
        <div className="image-node-toolbar-bridge">
          <div className="image-node-toolbar" role="toolbar" aria-label="Image node tools">
            <button type="button" className="image-node-toolbar-label"><Icon name="openai" />GPT Image 2.6 Sunburst<Icon name="chevron" /></button>
            <span className="image-node-separator" />
            <button type="button" className="image-node-toolbar-label">1:1<Icon name="chevron" /></button>
            <span className="image-node-separator" />
            <button type="button" className="image-node-toolbar-label image-node-tools-label"><Icon name="tools" />Tools<Icon name="chevron" /></button>
            <span className="image-node-separator" />
            <button type="button" aria-label="Lock node" aria-pressed={locked} onClick={() => setLocked(value => !value)}><Icon name="unlock" /></button>
            <span className="image-node-separator" />
            <button type="button" aria-label="Tag"><span className="image-node-tag" /></button>
            <span className="image-node-separator" />
            <button type="button" aria-label="Add to assets" disabled><Icon name="folder" /></button>
            <button type="button" aria-label="Download" disabled><Icon name="download" /></button>
            <span className="image-node-separator" />
            <button type="button" aria-label="Comment"><Icon name="comment" /></button>
          </div>
        </div>

        <header className="image-node-heading">
          <h1><Icon name="image" /><span>Image</span></h1>
          <span className="image-node-model"><Icon name="openai" /><span>GPT Image 2.6 Sunburst</span></span>
        </header>

        <div className="image-node-card" onClick={() => { if (!locked) editor.current?.focus(); }}>
          <div className="image-node-surface">
            <div ref={promptScroll} className="image-node-composer" onWheel={event => event.stopPropagation()}>
              <textarea ref={editor} rows={1} value={prompt} readOnly={locked} spellCheck aria-label="Chat message" onChange={event => setPrompt(event.currentTarget.value)} onKeyDown={event => {
                if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing && !prompt && !locked) {
                  event.preventDefault();
                  setPrompt(example);
                }
              }} />
              {!prompt && <div className="image-node-suggestion" aria-hidden="true"><span className="image-node-suggestion-label">Try "{example}"</span><kbd>tab</kbd></div>}
            </div>

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
              <button type="button" aria-label="Mention node" {...tooltipProps('Mention node')} disabled={locked}><Icon name="mention" /></button>
              <button type="button" aria-label="Reference Element" {...tooltipProps('No Elements available')} disabled><Icon name="hash" /></button>
              <div className="image-node-actions-right">
                <button type="button" aria-label="Dictate prompt" {...tooltipProps('Dictate prompt')} disabled={locked}><Icon name="mic" /></button>
                <button type="button" aria-label="Enhance prompt" {...tooltipProps('Enhance prompt')} disabled={!hasPrompt || locked}><Icon name="enhance" /></button>
                <div className={`image-node-generate-group${quantity > 1 ? ' is-expanded' : ''}${hasPrompt && !locked ? '' : ' is-disabled'}`}>
                  <div className="image-node-quantity">
                    <button type="button" aria-label="Decrease quantity" disabled={!hasPrompt || locked || quantity <= 1} onClick={() => setQuantity(value => Math.max(1, value - 1))}><Icon name="minus" /></button>
                    <input aria-label="Quantity" role="spinbutton" aria-valuemin={1} aria-valuemax={20} aria-valuenow={quantity} inputMode="numeric" value={quantity} disabled={!hasPrompt || locked} onChange={event => setQuantity(Math.max(1, Math.min(20, Number(event.currentTarget.value) || 1)))} />
                    <button type="button" aria-label="Increase quantity" disabled={!hasPrompt || locked || quantity >= 20} onClick={() => setQuantity(value => Math.min(20, value + 1))}><Icon name="plus" /></button>
                  </div>
                  <button className="image-node-generate" type="button" aria-label="Generate" disabled={!hasPrompt || locked}><Icon name="generate" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="image-node-ports">
          <div className="image-node-inputs">
            <button ref={element => { ports.inputs.current[0] = element; }} type="button" className="image-node-input" aria-label="Prompt input">
              <span className="image-node-port-label"><span className="image-node-port-icon image-node-port-icon-text" aria-hidden="true" />Prompt</span><PortRing />
            </button>
            <button ref={element => { ports.inputs.current[1] = element; }} type="button" className="image-node-input" aria-label="Image input">
              <span className="image-node-port-label"><span className="image-node-port-icon image-node-port-icon-image" aria-hidden="true" />Image <span className="image-node-port-count">0/16</span></span><PortRing />
            </button>
          </div>
          <button ref={ports.output} type="button" className="image-node-output" aria-label="Add connected node">
            <span className="image-node-output-visual"><OutputPortIcon /></span>
          </button>
        </div>
      </section>
      {tooltip && createPortal(
        <div className="image-node-tooltip-position" style={{ left: tooltip.x, top: tooltip.y }}>
          <div id={tooltipId} role="tooltip" className="image-node-tooltip" data-state={tooltip.open ? 'open' : 'closed'}>{tooltip.label}</div>
        </div>, document.body,
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<ImagePromptNode />);
