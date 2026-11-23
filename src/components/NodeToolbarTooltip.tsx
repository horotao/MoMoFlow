import { cloneElement, createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import './node-toolbar-tooltip.css';

const ToolbarTooltipContext = createContext(false);

/** Keep adjacent controls in one delay group, including nested menu triggers. */
export function NodeToolbarTooltipScope({ children }: { children: ReactNode }) {
  const grouped = useContext(ToolbarTooltipContext);
  if (grouped) return children;
  return <ToolbarTooltipContext.Provider value={true}>
    <Tooltip.Provider delayDuration={300} skipDelayDuration={300} disableHoverableContent>{children}</Tooltip.Provider>
  </ToolbarTooltipContext.Provider>;
}

export function NodeToolbarTooltip({ label, children }: {
  label: string;
  children: ReactElement<{ title?: string; disabled?: boolean }>;
}) {
  const [keyboard, setKeyboard] = useState(false);
  const trigger = cloneElement(children, { title: undefined });
  return <NodeToolbarTooltipScope><Tooltip.Root>
    <Tooltip.Trigger asChild onPointerMove={() => setKeyboard(false)} onFocus={() => setKeyboard(true)}>
      {children.props.disabled ? <span className="node-toolbar-tooltip-trigger">{trigger}</span> : trigger}
    </Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Content side="top" sideOffset={4} collisionPadding={8}
      className="node-toolbar-tooltip nodrag nopan nowheel" data-keyboard={keyboard || undefined}
      onEscapeKeyDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      {label}
    </Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root></NodeToolbarTooltipScope>;
}
