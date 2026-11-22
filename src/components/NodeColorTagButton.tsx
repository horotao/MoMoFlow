import * as Menu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { colorTags } from '../nodes/colorTags';
import { useNodeColorTags } from './CanvasColorTagContext';
import './canvas-color-tags.css';

export function NodeColorTagButton() {
  const { id, tags = [], locked, change } = useNodeColorTags();
  const [keyboard, setKeyboard] = useState(false);
  return <Menu.Root modal={false}>
    <Menu.Trigger asChild><button type="button" className="color-tag-trigger" data-tagged={tags.length > 0} aria-label="Tag" title="颜色标记" disabled={!id || locked}
      onPointerDown={() => setKeyboard(false)} onKeyDown={() => setKeyboard(true)}>
      <span className="node-tag-stack">{tags.length ? colorTags.filter(tag => tags.includes(tag.id)).map(tag => <span key={tag.id} className="node-tag-dot" style={{ background: tag.color }} />) : <span className="image-node-tag" />}</span>
    </button></Menu.Trigger>
    <Menu.Portal><Menu.Content className="color-tag-menu color-tag-picker nodrag nopan nowheel" sideOffset={9} align="start" collisionPadding={8} data-keyboard={keyboard}
      aria-label="节点颜色标记" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => {
        event.stopPropagation();
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const options = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
        const index = options.indexOf(document.activeElement as HTMLElement);
        options[(index + (event.key === 'ArrowLeft' ? -1 : 1) + options.length) % options.length]?.focus({ preventScroll: true });
      }}>
      <div className="color-tag-picker-row">
      <Menu.Item className="color-tag-none" onSelect={event => { event.preventDefault(); change(); }}>None</Menu.Item>
      {colorTags.map(tag => <Menu.CheckboxItem key={tag.id} className="color-tag-choice" data-color={tag.id} checked={tags.includes(tag.id)} aria-label={`标记${tag.label}`}
        onSelect={event => event.preventDefault()} onCheckedChange={() => change(tag.id)}>
        <span className="node-tag-dot" style={{ background: tag.color }} />
        <svg className="color-tag-mark color-tag-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        <svg className="color-tag-mark color-tag-plus" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
      </Menu.CheckboxItem>)}
      </div>
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}
