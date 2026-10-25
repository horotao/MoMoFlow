import { forwardRef, type SVGProps } from 'react';

export const ResizeIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string }>(
  function ResizeIcon({ size = 24, ...props }, ref) {
    return <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 4h10a1 1 0 0 1 1 1v10M4 9V5a1 1 0 0 1 1-1M20 19a1 1 0 0 1-1 1h-4" />
      <rect x="4" y="12" width="8" height="8" rx="1" />
      <path d="m10 14 6-6m-5 0h5v5" />
    </svg>;
  },
);

export function AspectRatioIcon({ locked }: { locked: boolean }) {
  if (!locked) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M7.5 7h9a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5M6 7.5A1.5 1.5 0 0 1 7.5 6h9A1.5 1.5 0 0 1 18 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5zM9.5 9a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0V10h1.5a.5.5 0 0 0 0-1zm5.5 3.5a.5.5 0 0 0-1 0V14h-1.5a.5.5 0 0 0 0 1h2a.5.5 0 0 0 .5-.5z" />
    </svg>;
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="1" />
    <path d="M8 11V8h3m2 8h3v-3" />
    <path d="m10 10 4 4" strokeDasharray="1 2.5" />
  </svg>;
}
