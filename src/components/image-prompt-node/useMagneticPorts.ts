import { CanvasPortPointerContext, inputAnchorX, magneticPortRadius, outputAnchorOffset, type PortPointer } from './canvasPortPointer';
import { useContext, useEffect, useRef } from 'react';
import { inputPortMinimumSpacing, inputPortSpacing, separateInputPorts } from '../magneticPortSpacing';

// FLORA's rendered handle geometry: 160-unit attraction radius, 35% pull,
// capped at 20 units, retargeted from the current position over 500ms (easeOutCubic).
// Magnetic movement and the separate 150ms reveal never share a transform.
export function useMagneticPorts(hasVideoInput = false, hasFrameInputs = false, hasAudioInput = false) {
  const register = useContext(CanvasPortPointerContext);
  const node = useRef<HTMLElement>(null);
  const input = useRef<HTMLButtonElement>(null);
  const output = useRef<HTMLButtonElement>(null);
  const textInput = useRef<HTMLButtonElement | null>(null);

  const audioInput = useRef<HTMLButtonElement | null>(null);
  const videoInput = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const elements = hasVideoInput ? [input, output, textInput, videoInput] : [input, output, textInput];
    const framePorts = [...host.querySelectorAll<HTMLButtonElement>('[data-connection-port$="-frame"]')];
    for (const port of framePorts) elements.push({ current: port });
    const inputOrder = [2, ...framePorts.map((_, i) => 4 + i), 0, ...(hasVideoInput ? [3] : [])].filter(index => elements[index].current);
    if (hasAudioInput) { inputOrder.push(elements.length); elements.push(audioInput); }
    const tracks = elements.map(() => ({
      x: 0, y: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, started: 0,
    }));
    let frame = 0;
    let pointer: PortPointer | null = null;
    let disposed = false;

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
      tracks.forEach(track => { moving = advance(track, now) || moving; });
      const ys = tracks.map(track => track.y);
      for (let i = 1; i < inputOrder.length; i++) {
        const top = inputOrder[i - 1], bottom = inputOrder[i];
        if (elements[top].current && elements[bottom].current) {
          [ys[top], ys[bottom]] = separateInputPorts(ys[top], ys[bottom], inputPortSpacing, inputPortMinimumSpacing);
        }
      }
      tracks.forEach((track, index) => {
        const element = elements[index].current;
        const y = ys[index];
        const transform = `translate3d(${track.x}px, ${y}px, 0px)`;
        if (element && element.style.transform !== transform) element.style.transform = transform;
      });
      if (moving) frame = requestAnimationFrame(paint);
    }

    function retarget() {
      if (!host || disposed) return;
      const width = pointer?.width ?? 0, height = pointer?.height ?? 0;
      const anchors = elements.map((_, index) => index === 1 ? { x: width + outputAnchorOffset, y: height / 2 }
        : { x: inputAnchorX, y: height / 2 + (inputOrder.indexOf(index) - (inputOrder.length - 1) / 2) * inputPortSpacing });
      const now = performance.now();
      tracks.forEach((track, index) => {
        advance(track, now);
        let x = 0;
        let y = 0;
        let near = false;
        const element = elements[index].current;
        if (pointer && finePointer.matches && element && !element.matches(':disabled, [data-locked=true]') && element.dataset.connectionEligible !== 'false') {
          const dx = pointer.x - anchors[index].x;
          const dy = pointer.y - anchors[index].y;
          if (Math.hypot(dx, dy) < magneticPortRadius) {
            near = true;
            x = dx * .35;
            y = dy * .35;
            const length = Math.hypot(x, y);
            if (length > 20) { x *= 20 / length; y *= 20 / length; }
          }
        }
        // Reveal on the same fixed-anchor field as the pull, before the pointer
        // reaches the port hit area. Keep CSS reveal and magnetic transforms separate.
        const attribute = elements[index] === audioInput ? 'data-audio-port-near' : index === 0 ? 'data-input-port-near' : index === 1 ? 'data-output-port-near' : index === 2 ? 'data-text-port-near' : index === 3 ? 'data-video-port-near' : `data-frame-${index}-port-near`;
        if (host.hasAttribute(attribute) !== near) host.toggleAttribute(attribute, near);
        if (track.toX === x && track.toY === y) return;
        track.fromX = track.x;
        track.fromY = track.y;
        track.toX = x;
        track.toY = y;
        track.started = now;
      });
      if (!frame) paint(now);
    }

    function updatePointer(next: PortPointer | null) { pointer = next; retarget(); }
    const id = host.closest<HTMLElement>('.react-flow__node')?.dataset.id;
    const stopPointer = register && id ? register(id, updatePointer) : observeElementPointer(host, updatePointer);
    reduced.addEventListener('change', retarget);
    finePointer.addEventListener('change', retarget);
    const availability = new MutationObserver(retarget);
    elements.forEach(ref => {
      if (ref.current) availability.observe(ref.current, { attributes: true, attributeFilter: ['disabled', 'data-connection-eligible'] });
    });
    return () => {
      disposed = true;
      stopPointer();
      availability.disconnect();
      host.removeAttribute('data-input-port-near');
      host.removeAttribute('data-output-port-near');
      host.removeAttribute('data-text-port-near');
      host.removeAttribute('data-video-port-near');
      host.removeAttribute('data-audio-port-near');
      framePorts.forEach((_, i) => host.removeAttribute(`data-frame-${4 + i}-port-near`));
      cancelAnimationFrame(frame);
      reduced.removeEventListener('change', retarget);
      finePointer.removeEventListener('change', retarget);
    };
  }, [register, hasVideoInput, hasFrameInputs, hasAudioInput]);

  return { node, input, output, textInput, videoInput, audioInput };
}

// Standalone previews have no canvas store or shared pointer projection.
function observeElementPointer(host: HTMLElement, update: (pointer: PortPointer | null) => void) {
  let client: { x: number; y: number } | null = null;
  function measure() {
    if (!client || !host.offsetWidth) { update(null); return; }
    const rect = host.getBoundingClientRect();
    const scale = rect.width / host.offsetWidth;
    update(scale > 0 ? { x: (client.x - rect.left) / scale, y: (client.y - rect.top) / scale,
      width: host.offsetWidth, height: host.offsetHeight } : null);
  }
  function move(event: PointerEvent) {
    client = event.pointerType === 'mouse' || event.pointerType === 'pen' ? { x: event.clientX, y: event.clientY } : null;
    measure();
  }
  function leave() { client = null; update(null); }
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('blur', leave);
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('resize', measure);
  window.addEventListener('scroll', measure, true);
  const size = new ResizeObserver(measure);
  size.observe(host);
  const geometry = new MutationObserver(measure);
  for (const element of [host.closest('.react-flow__node'), host.closest('.react-flow__viewport')]) {
    if (element) geometry.observe(element, { attributes: true, attributeFilter: ['style'] });
  }
  return () => {
    size.disconnect();
    geometry.disconnect();
    window.removeEventListener('pointermove', move);
    window.removeEventListener('blur', leave);
    document.documentElement.removeEventListener('pointerleave', leave);
    window.removeEventListener('resize', measure);
    window.removeEventListener('scroll', measure, true);
  };
}
