import type { CSSProperties } from 'react';

// FLORA's input shader follows CircleDashed: eight r=10 arcs, a 1.5px
// round-capped stroke in a 24px plane, and a connected dot of radius 3.84.
export function InputPortRing() {
  // The shader fades outward from the signed-distance boundary, whereas SVG
  // centers its coverage there. Match the half-device-pixel outer contour.
  const pixel = 1 / (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  return <svg className="image-node-port" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ '--port-aa': `${pixel}px` } as CSSProperties}>
    <path className="image-node-port-ring" d="M10.1 2.182a10 10 0 0 1 3.8 0 M13.9 21.818a10 10 0 0 1-3.8 0 M17.609 3.721a10 10 0 0 1 2.69 2.7 M2.182 13.9a10 10 0 0 1 0-3.8 M20.279 17.609a10 10 0 0 1-2.7 2.69 M21.818 10.1a10 10 0 0 1 0 3.8 M3.721 6.391a10 10 0 0 1 2.7-2.69 M6.391 20.279a10 10 0 0 1-2.69-2.7"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle className="image-node-port-dot" cx="12" cy="12" r="3.84" fill="currentColor" />
  </svg>;
}
