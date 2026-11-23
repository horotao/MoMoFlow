import { useId, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CircleArrowUp01Icon } from '@hugeicons/core-free-icons';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-generation-options.css';

export function GenerationOptionsPanel({ children, label = '生成选项', icon, className = '', onCollapse }: {
  children: ReactNode; label?: string; icon?: ReactNode; className?: string; onCollapse?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  return <Tooltip.Provider delayDuration={300}><section className={`image-generation-options nodrag nopan nowheel ${className}`} aria-label={label}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()} onKeyDown={event => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') event.stopPropagation();
    }}>
    <h3><button type="button" className="generation-options-heading" aria-expanded={expanded} aria-controls={id}
      onClick={() => { setExpanded(!expanded); if (expanded) onCollapse?.(); }}>
      {icon ?? <HugeiconsIcon icon={CircleArrowUp01Icon} size={14} />}<span className="generation-options-label">{label}</span>
      <ImagePromptIcon name="chevron" className={expanded ? '' : 'is-collapsed'} />
    </button></h3>
    {expanded && <div id={id} className="generation-options-content">{children}</div>}
  </section></Tooltip.Provider>;
}
