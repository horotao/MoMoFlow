import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Re-run anchor placement whenever the viewport resizes, an ancestor scrolls,
 * the anchor resizes, or React Flow pans/zooms/moves the node containing it.
 */
export function useAnchorPositionObserver(
  anchor: RefObject<HTMLElement | null>,
  place: () => void,
  ignoreScrollInside?: () => readonly (HTMLElement | null | undefined)[],
) {
  const placeRef = useRef(place);
  placeRef.current = place;
  const ignoreRef = useRef(ignoreScrollInside);
  ignoreRef.current = ignoreScrollInside;

  useLayoutEffect(() => {
    const element = anchor.current;
    let rafId = 0;
    const run = () => placeRef.current();
    const syncTransform = () => {
      run();
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          run();
        });
      }
    };
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node) {
        const ignored = ignoreRef.current?.() ?? [];
        if (ignored.some(container => container?.contains(event.target as Node))) return;
      }
      run();
    };

    run();
    window.addEventListener('resize', run);
    window.addEventListener('scroll', handleScroll, true);

    const resizeObserver = new ResizeObserver(run);
    if (element) resizeObserver.observe(element);

    const mutationObserver = new MutationObserver(syncTransform);
    const observed = new Set<Element>();
    for (const target of [
      element?.closest('.react-flow__viewport'),
      element?.closest('.react-flow__node'),
    ]) {
      if (target && !observed.has(target)) {
        observed.add(target);
        mutationObserver.observe(target, { attributes: true, attributeFilter: ['style'] });
      }
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', run);
      window.removeEventListener('scroll', handleScroll, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [anchor]);
}
