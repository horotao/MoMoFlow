import { useEffect, useRef } from 'react';
import { inputPortMinimumSpacing, inputPortSpacing, separateInputPorts } from '../magneticPortSpacing';

// FLORA's rendered handle geometry: 160-unit attraction radius, 35% pull,
// capped at 20 units, retargeted from the current position over 500ms (easeOutCubic).
// Magnetic movement and the separate 150ms reveal never share a transform.
export function useMagneticPorts(hasVideoInput = false, hasFrameInputs = false) {
  const node = useRef<HTMLElement>(null);
  const input = useRef<HTMLButtonElement>(null);
  const output = useRef<HTMLButtonElement>(null);
  const textInput = useRef<HTMLButtonElement | null>(null);

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
    const tracks = elements.map(() => ({
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
      if (!host?.offsetWidth) return;
      const rect = host.getBoundingClientRect();
      const width = host.offsetWidth, height = host.offsetHeight;
      const scale = rect.width / width;
      const anchors = elements.map((_, index) => index === 1 ? { x: width + 28, y: height / 2 }
        : { x: -24, y: height / 2 + (inputOrder.indexOf(index) - (inputOrder.length - 1) / 2) * inputPortSpacing });
      const now = performance.now();
      tracks.forEach((track, index) => {
        advance(track, now);
        let x = 0;
        let y = 0;
        let near = false;
        const element = elements[index].current;
        if (pointer && finePointer.matches && element && !element.matches(':disabled, [data-locked=true]') && element.dataset.connectionEligible !== 'false') {
          const dx = (pointer.x - rect.left) / scale - anchors[index].x;
          const dy = (pointer.y - rect.top) / scale - anchors[index].y;
          if (Math.hypot(dx, dy) < 160) {
            near = true;
            x = dx * .35;
            y = dy * .35;
            const length = Math.hypot(x, y);
            if (length > 20) { x *= 20 / length; y *= 20 / length; }
          }
        }
        // Reveal on the same fixed-anchor field as the pull, before the pointer
        // reaches the port hit area. Keep CSS reveal and magnetic transforms separate.
        const attribute = index === 0 ? 'data-input-port-near' : index === 1 ? 'data-output-port-near' : index === 2 ? 'data-text-port-near' : index === 3 ? 'data-video-port-near' : `data-frame-${index}-port-near`;
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

    function move(event: PointerEvent) {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') { leave(); return; }
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
    const geometry = new MutationObserver(() => { if (pointer) retarget(); });
    for (const element of [host.closest('.react-flow__node'), host.closest('.react-flow__viewport')]) {
      if (element) geometry.observe(element, { attributes: true, attributeFilter: ['style'] });
    }
    const availability = new MutationObserver(retarget);
    elements.forEach(ref => {
      if (ref.current) availability.observe(ref.current, { attributes: true, attributeFilter: ['disabled', 'data-connection-eligible'] });
    });
    const size = new ResizeObserver(() => { if (pointer) retarget(); });
    size.observe(host);
    return () => {
      geometry.disconnect();
      availability.disconnect();
      size.disconnect();
      host.removeAttribute('data-input-port-near');
      host.removeAttribute('data-output-port-near');
      host.removeAttribute('data-text-port-near');
      host.removeAttribute('data-video-port-near');
      framePorts.forEach((_, i) => host.removeAttribute(`data-frame-${4 + i}-port-near`));
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', retarget);
      window.removeEventListener('scroll', retarget, true);
      reduced.removeEventListener('change', retarget);
      finePointer.removeEventListener('change', retarget);
    };
  }, [hasVideoInput, hasFrameInputs]);

  return { node, input, output, textInput, videoInput };
}
