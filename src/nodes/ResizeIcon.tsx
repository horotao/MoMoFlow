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
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="1" />
    {locked ? <><path d="M8 11V8h3m2 8h3v-3" /><path d="m10 10 4 4" strokeDasharray="1 2.5" /></> : <><path d="M8 12h8m-2-2 2 2-2 2M12 8v8m-2-2 2 2 2-2" /></>}
  </svg>;
}
