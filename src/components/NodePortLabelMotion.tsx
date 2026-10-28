import { spring as createSpring } from 'motion';
import { spring } from '../lib/springs';

// CSS keeps the existing hover/selection behavior without subscribing every
// label to pointer events. Derive the curve from the same Motion spring tokens.
const enter = createSpring({
  keyframes: [0, 1],
  duration: spring.moderate.duration * 1000,
  bounce: spring.moderate.bounce,
}).toString();
const leave = `${spring.moderate.exit.duration}s ease-out`;
const labels = ':is(.text-node-port-label, .describer-port-label, .file-node-port-label, .router-port-label)';

export function NodePortLabelMotion() {
  return <style>{`
    .react-flow .react-flow__node ${labels} {
      pointer-events: none;
      visibility: hidden;
      opacity: 0;
      transform: translateY(3px);
      transition: opacity ${leave}, transform ${leave}, visibility 0s ${spring.moderate.exit.duration}s;
    }

    .react-flow .react-flow__node:hover ${labels},
    .react-flow .react-flow__node.selected ${labels}:not(.file-node-port-label) {
      visibility: visible;
      opacity: 1;
      transform: translateY(0);
      transition: opacity ${enter}, transform ${enter}, visibility 0s;
    }

    /* Keep group selections free of overlapping labels, including during exit. */
    .react-flow .react-flow__nodes:has(> .react-flow__node.selected ~ .react-flow__node.selected) .react-flow__node ${labels} {
      visibility: hidden;
      opacity: 0;
      transition: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .react-flow .react-flow__node ${labels} {
        transform: none !important;
        transition-property: opacity, visibility !important;
        transition-duration: ${spring.moderate.exit.duration}s, 0s !important;
        transition-delay: 0s, ${spring.moderate.exit.duration}s !important;
      }
      .react-flow .react-flow__node:hover ${labels},
      .react-flow .react-flow__node.selected ${labels}:not(.file-node-port-label) {
        transition-delay: 0s !important;
      }
      .react-flow .react-flow__nodes:has(> .react-flow__node.selected ~ .react-flow__node.selected) .react-flow__node ${labels} {
        transition: none !important;
      }
    }
  `}</style>;
}
