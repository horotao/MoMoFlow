import { useContext, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { animate, MotionConfigContext, useMotionValue } from 'motion/react';
import { spring } from '../lib/springs';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const getServerReducedMotion = () => false;
function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useImagePreviewHeight(aspectRatio: string, grid: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useMotionValue<number | string>('auto');
  // Motion's hook keeps the preference from mount time. Subscribe directly so
  // a live OS change reruns the layout effect and stops any in-flight spring.
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const { reducedMotion: policy } = useContext(MotionConfigContext);
  const reducedMotion = policy === 'always' || (policy !== 'never' && prefersReducedMotion);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    height.stop();
    if (grid) {
      height.set('auto');
      return;
    }

    const [ratioWidth, ratioHeight = 1] = aspectRatio.split('/').map(Number);
    const ratio = ratioWidth / ratioHeight;
    if (!Number.isFinite(ratio) || ratio <= 0) return;

    // React Flow measures the real node box for bounds and the minimap.
    // Animate its height instead of scaling the image, text, and handles;
    // explicitly honor reduced motion because this is a layout property.
    let width = parseFloat(getComputedStyle(element).width);
    const resize = (nextWidth: number, animateRatio: boolean) => {
      width = nextWidth;
      if (width <= 0) return;
      height.stop();
      const target = width / ratio;
      if (animateRatio && !reducedMotion && typeof height.get() === 'number') {
        animate(height, target, spring.slow);
      } else {
        height.set(target);
      }
    };
    resize(width, true);

    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.borderBoxSize[0]?.inlineSize ?? element.offsetWidth;
      // Ignore our own height animation and canvas zoom. Width changes snap
      // so an outer resize never chases an already moving inner surface.
      if (nextWidth !== width) resize(nextWidth, false);
    });
    observer.observe(element);
    return () => { observer.disconnect(); height.stop(); };
  }, [aspectRatio, grid, height, reducedMotion]);

  return { ref, height };
}
