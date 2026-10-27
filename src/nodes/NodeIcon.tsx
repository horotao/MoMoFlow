import { HugeiconsIcon } from '@hugeicons/react';
import { nodeIcons } from './nodeIcons';

type Props = {
  nodeType: keyof typeof nodeIcons;
  size?: number;
  className?: string;
};

export function NodeIcon({ nodeType, size, className }: Props) {
  return <HugeiconsIcon icon={nodeIcons[nodeType]} size={size} className={className} aria-hidden="true" />;
}
