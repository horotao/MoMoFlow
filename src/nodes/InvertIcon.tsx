import { forwardRef, type SVGProps } from 'react';

// One filled silhouette: a half-disc and its outer rim, without an inset outline.
export const InvertIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string }>(
  function InvertIcon({ size = 24, color = 'currentColor', ...props }, ref) {
    return <svg {...props} ref={ref} width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" aria-hidden="true">
      <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 1.3v17.4a8.7 8.7 0 1 1 0-17.4Z" />
    </svg>;
  },
);
