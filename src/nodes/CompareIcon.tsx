import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

export const CompareIcon = forwardRef<SVGSVGElement, LucideProps>(function CompareIcon({ size = 24, ...props }, ref) {
  return <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" {...props}>
    <rect x="10.5" y="4.5" width="3" height="15" rx="1" />
    <path d="m3.5 12 4-3.5v7Zm17 0-4-3.5v7Z" strokeLinejoin="round" />
  </svg>;
});
