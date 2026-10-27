import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const MatteGrowShrinkIcon = forwardRef<SVGSVGElement, LucideProps>(function MatteGrowShrinkIcon({ size = 24, ...props }, ref) {
  return <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M4.5 16a.5.5 0 0 1 .5.5V19h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H19v-2.5a.5.5 0 0 1 .5-.5M18 18H6V6h12zM7 17h10V7H7zm8.146-7.438a.5.5 0 1 1 .707.707l-5.585 5.585a.5.5 0 0 1-.707-.707zm0 2.829a.5.5 0 0 1 .707.707l-2.756 2.755a.5.5 0 0 1-.707-.707zm.036 2.792a.479.479 0 0 1 .817.338v.102a.377.377 0 0 1-.376.377h-.102a.48.48 0 0 1-.34-.817M14.086 8a.5.5 0 0 1 .354.854L8.853 14.44a.5.5 0 0 1-.707-.708l5.586-5.586A.5.5 0 0 1 14.086 8m-2.829 0a.5.5 0 0 1 .354.854L8.853 11.61a.5.5 0 0 1-.707-.707l2.758-2.758A.5.5 0 0 1 11.257 8M8.48 8a.48.48 0 1 1-.48.48v-.1A.38.38 0 0 1 8.38 8zM7.5 4a.5.5 0 0 1 0 1H5v2.5a.5.5 0 0 1-1 0v-3a.5.5 0 0 1 .5-.5zm12 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V5h-2.5a.5.5 0 0 1 0-1z" />
  </svg>;
});
