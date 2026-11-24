import { useLayoutEffect, useRef, useState } from 'react';
import './image-prompt-generation.css';

export interface ImagePromptGenerationState {
  /** Change the ID for each new run. */
  id: string | number;
  /** Unix time in milliseconds; omit while the request is being prepared. */
  startedAt?: number;
  /** The estimate displayed in the header. The visual timeline uses twice this duration. */
  estimatedSeconds?: number;
  /** Optional explicit visual progress, from 0 to 1. */
  progress?: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

// Solve the reference's cubic-bezier(.33, 1, .68, 1) for its X coordinate.
function progressAtTime(time: number) {
  const x = clamp(time);
  let low = 0;
  let high = 1;
  for (let pass = 0; pass < 24; pass++) {
    const t = (low + high) / 2;
    const inverse = 1 - t;
    const position = 3 * inverse * inverse * t * .33 + 3 * inverse * t * t * .68 + t ** 3;
    if (position < x) low = t;
    else high = t;
  }
  return 1 - (1 - (low + high) / 2) ** 3;
}

export function ImagePromptGeneration({ state, borderOnly = false, fillOnly = false, label }: { state: ImagePromptGenerationState | null; borderOnly?: boolean; fillOnly?: boolean; label?: string }) {
  const active = state !== null;
  const id = state?.id;
  const startedAt = state?.startedAt;
  const estimate = state?.estimatedSeconds;
  const progress = state?.progress;
  const [retained, setRetained] = useState(active);
  const fill = useRef<HTMLDivElement>(null);
  const previousId = useRef<string | number | undefined>(undefined);
  const fallbackStartedAt = useRef(0);

  useLayoutEffect(() => {
    const element = fill.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const real = Number.isFinite(startedAt) && Number.isFinite(estimate) && (estimate ?? 0) > 0;
    const explicit = Number.isFinite(progress);
    const newRun = active && previousId.current !== id;
    if (newRun) fallbackStartedAt.current = Date.now();
    if (active) {
      setRetained(true);
      previousId.current = id;
    }
    let animation: Animation | undefined;
    let bridgeTimer: ReturnType<typeof setTimeout> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;

    function freeze() {
      if (animation) {
        element!.style.transform = getComputedStyle(element!).transform;
        animation.cancel();
        animation = undefined;
      }
      clearTimeout(bridgeTimer);
    }

    function scaleAt(now: number) {
      if (explicit) return clamp(progress!);
      if (real) return .95 * progressAtTime((now - startedAt!) / (estimate! * 2000));
      return .05 * clamp((now - fallbackStartedAt.current) / 60000);
    }

    function playTimeline() {
      freeze();
      if (reduced.matches || explicit) {
        const scale = explicit ? clamp(progress!) : real ? .95 : .05;
        element!.style.transform = `scaleX(${scale})`;
        return;
      }
      const duration = real ? estimate! * 2000 : 60000;
      animation = element!.animate([
        { transform: 'scaleX(0)' },
        { transform: `scaleX(${real ? .95 : .05})` },
      ], { duration, easing: real ? 'cubic-bezier(.33, 1, .68, 1)' : 'linear', fill: 'both' });
      animation.currentTime = Math.max(0, Date.now() - (real ? startedAt! : fallbackStartedAt.current));
    }

    function complete() {
      freeze();
      const current = getComputedStyle(element!).transform;
      if (reduced.matches) element!.style.transform = 'scaleX(1)';
      else animation = element!.animate([
        { transform: current }, { transform: 'scaleX(1)' },
      ], { duration: 300, easing: 'cubic-bezier(0, 0, .58, 1)', fill: 'forwards' });
    }

    function onMotionChange() {
      if (active) playTimeline();
      else complete();
    }

    function cleanup() {
      freeze();
      clearTimeout(finishTimer);
      reduced.removeEventListener('change', onMotionChange);
    }

    if (active) {
      if (newRun || reduced.matches) playTimeline();
      else {
        // Timing corrections start at the painted position, including during another correction.
        const current = getComputedStyle(element).transform;
        animation = element.animate([
          { transform: current }, { transform: `scaleX(${scaleAt(Date.now() + 280)})` },
        ], { duration: 280, easing: 'cubic-bezier(0, 0, .58, 1)', fill: 'forwards' });
        bridgeTimer = setTimeout(playTimeline, 280);
      }
    } else {
      complete();
      finishTimer = setTimeout(() => {
        cleanup();
        previousId.current = undefined;
        setRetained(false);
      }, 400);
    }
    reduced.addEventListener('change', onMotionChange);
    return cleanup;
  }, [active, id, startedAt, estimate, progress]);

  if (!active && (borderOnly || !retained)) return null;
  return <div className={fillOnly ? 'image-node-thumbnail-generation' : 'image-node-generation'} data-phase={active ? 'running' : 'finishing'}
    role="progressbar" aria-label={label ?? (borderOnly ? 'Generating text' : 'Generating image')} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={!active ? 100 : Number.isFinite(progress) ? Math.round(clamp(progress!) * 100) : undefined}>
    <div className="image-node-generation-fill-clip" hidden={borderOnly}><div ref={fill} className="image-node-generation-fill" /></div>
    {!fillOnly && <div className="image-node-generation-ring" aria-hidden="true"><div className="image-node-generation-light" /></div>}
  </div>;
}
