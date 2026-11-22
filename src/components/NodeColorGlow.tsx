import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colorTagGlowMetrics, colorTagGlowShadow } from './colorTagGlow';

export function NodeColorGlow({ color, zoom, selected }: { color: string; zoom: number; selected: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const style = getComputedStyle(element);
    setSize({ width: parseFloat(style.width), height: parseFloat(style.height) });
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { reach, ring } = colorTagGlowMetrics(zoom, size.width, size.height);
  const shadow = useMemo(() => colorTagGlowShadow(color, reach), [color, reach]);
  return <div ref={root} className="node-color-glow" data-color={color} data-selected={selected} aria-hidden="true"
    style={{ boxShadow: shadow }}>
    <div className="node-color-tag-ring" style={{ boxShadow: `inset 0 0 0 ${ring}px ${color}` }} />
  </div>;
}
