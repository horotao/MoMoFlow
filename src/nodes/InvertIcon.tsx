import { forwardRef, type SVGProps } from 'react';

export const InvertIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string }>(
  function InvertIcon({ size = 24, color = 'currentColor', ...props }, ref) {
    return <svg {...props} ref={ref} width={size} height={size} viewBox="0 0 24 24" color={color} fill="none" stroke="none" aria-hidden="true">
      <path fill="var(--fpl-icon-color, var(--color-icon, currentColor))" d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18m-.5 1.017a8 8 0 0 0 0 15.965zm1 15.965a7.998 7.998 0 0 0 0-15.965zm2.385-2.482c.474 0 .65.56.225.77q-.208.105-.422.194a.5.5 0 0 1-.186.036H14a.5.5 0 0 1 0-1zm2.31-2c.384 0 .62.415.387.722l-.075.097a.48.48 0 0 1-.38.181H14a.5.5 0 0 1 0-1zm1.02-2c.32 0 .558.295.463.6l-.024.076a.48.48 0 0 1-.459.324H14a.5.5 0 0 1 0-1zm.3-2c.262 0 .483.203.485.466v.068a.477.477 0 0 1-.485.466H14a.5.5 0 0 1 0-1zm-.32-2a.48.48 0 0 1 .46.324l.023.076c.095.305-.143.6-.462.6H14a.5.5 0 0 1 0-1zm-1.068-2c.148 0 .289.065.38.18l.075.098c.232.307-.003.722-.388.722H14a.5.5 0 0 1 0-1zm-2.625-2q.096 0 .185.036.216.09.423.193c.425.212.25.77-.225.771H14a.5.5 0 0 1 0-1z" />
    </svg>;
  },
);
