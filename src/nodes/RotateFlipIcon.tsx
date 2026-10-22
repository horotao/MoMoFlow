import { forwardRef, type SVGProps } from 'react';

export const RotateFlipIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string }>(
  function RotateFlipIcon({ size = 24, ...props }, ref) {
    return <svg {...props} ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7.8" y="10.8" width="8.4" height="8.4" rx="1" transform="rotate(45 12 15)" />
      <path d="m5.5 9 4.4-4.4a3 3 0 0 1 4.2 0L18.5 9m0-3.5V9H15" />
    </svg>;
  },
);

export function FlipIcon({ vertical = false }: { vertical?: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g transform={vertical ? 'rotate(90 12 12)' : undefined}><path d="M12 6.5v11M6.5 9v6l3-3zM17.5 9v6l-3-3z" /></g>
  </svg>;
}
