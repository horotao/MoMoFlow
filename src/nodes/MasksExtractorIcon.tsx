import { forwardRef, type SVGProps } from 'react';

export const MasksExtractorIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string }>(
  function MasksExtractorIcon({ size = 24, ...props }, ref) {
    return <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path fill="currentColor" d="M18 4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM5 18a1 1 0 0 0 1 1h5.498v-6.507H5zm7.498 1H18a1 1 0 0 0 1-1v-5.507h-6.502zm5.002-5.5a.5.5 0 0 1 .354.854l-3.5 3.5a.5.5 0 1 1-.707-.707l3.5-3.5a.5.5 0 0 1 .353-.147m-.354 3.146a.5.5 0 1 1 .707.707l-.5.5a.5.5 0 1 1-.707-.707zM14.5 13.5a.5.5 0 0 1 .354.854l-.5.5a.5.5 0 1 1-.707-.707l.5-.5a.5.5 0 0 1 .353-.147M6 5a1 1 0 0 0-1 1v5.493h6.498V5zm6.498 6.493H19V6a1 1 0 0 0-1-1h-5.502zM10 6a.5.5 0 0 1 .354.854l-3.5 3.5a.5.5 0 1 1-.708-.708l3.5-3.5A.5.5 0 0 1 10 6m-.354 3.146a.5.5 0 0 1 .707.708l-.5.5a.5.5 0 1 1-.707-.708zM7 6a.5.5 0 0 1 .354.854l-.5.5a.5.5 0 0 1-.708-.708l.5-.5A.5.5 0 0 1 7 6" />
    </svg>;
  },
);
