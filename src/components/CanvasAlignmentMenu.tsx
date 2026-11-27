import { NodeToolbarTooltip } from './NodeToolbarTooltip';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, LayoutDashboard, type LucideIcon,
} from 'lucide-react';
import type { CanvasAlignment } from './canvasLayout';
import { ScrollArea } from './ui/scroll-area';

const groups: { label: string; actions: {
  key: CanvasAlignment; label: string; icon: LucideIcon; minimum?: number;
}[] }[] = [
  { label: '横向', actions: [
    { key: 'left', label: '左对齐', icon: AlignStartVertical },
    { key: 'center', label: '水平居中', icon: AlignCenterVertical },
    { key: 'right', label: '右对齐', icon: AlignEndVertical },
    { key: 'justifyHorizontal', label: '水平等距', icon: AlignHorizontalSpaceBetween, minimum: 3 },
  ] },
  { label: '纵向', actions: [
    { key: 'top', label: '顶部对齐', icon: AlignStartHorizontal },
    { key: 'middle', label: '垂直居中', icon: AlignCenterHorizontal },
    { key: 'bottom', label: '底部对齐', icon: AlignEndHorizontal },
    { key: 'justifyVertical', label: '垂直等距', icon: AlignVerticalSpaceBetween, minimum: 3 },
  ] },
];

export function CanvasAlignmentMenu({ disabled, count, onAlign, onArrange, open, onOpenChange }: {
  disabled: boolean;
  count: number;
  onAlign: (action: CanvasAlignment) => void;
  onArrange: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return <Menu.Root modal={false} open={open} onOpenChange={onOpenChange}>
    <NodeToolbarTooltip label="对齐与分布"><Menu.Trigger asChild disabled={disabled}>
      <button type="button" aria-label="对齐与分布" disabled={disabled}>
        <LayoutDashboard size={16} aria-hidden="true" />
      </button>
    </Menu.Trigger></NodeToolbarTooltip>
    <Menu.Portal>
      <Menu.Content aria-label="对齐与分布" className="canvas-alignment-menu nodrag nopan nowheel nokey"
        sideOffset={9} align="start" collisionPadding={8} updatePositionStrategy="always"
        onPointerDown={event => event.stopPropagation()}
        onWheel={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}>
        <ScrollArea className="canvas-alignment-scroll-area" viewportClassName="canvas-alignment-scroll">
        {groups.map(group => <Menu.Group key={group.label} aria-label={group.label}>
          <Menu.Label className="canvas-alignment-label">{group.label}</Menu.Label>
          {group.actions.map(({ key, label, icon: Icon, minimum = 2 }) => (
            <Menu.Item key={key} className="canvas-alignment-item" disabled={count < minimum} onSelect={() => onAlign(key)}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </Menu.Item>
          ))}
        </Menu.Group>)}
        <Menu.Separator className="canvas-alignment-separator" />
        <Menu.Item className="canvas-alignment-item" disabled={count < 2} onSelect={() => onArrange()}>
          <LayoutDashboard size={16} aria-hidden="true" />
          自动整理
        </Menu.Item>
        </ScrollArea>
      </Menu.Content>
    </Menu.Portal>
  </Menu.Root>;
}
