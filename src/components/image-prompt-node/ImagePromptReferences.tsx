import { useState, type Dispatch, type SetStateAction, type ReactEventHandler } from 'react';
import { DndContext, KeyboardSensor, MeasuringStrategy, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'motion/react';
import { ImagePromptIcon } from './ImagePromptIcon';
import './image-prompt-references.css';

export type ImagePromptReference = {
  id: string;
  name: string;
  videoImageRole?: 'First' | 'Last' | 'Ref';
  url?: string;
  kind?: 'image' | 'text' | 'video';
  onLoad?: ReactEventHandler<HTMLImageElement>;
};

export function ImagePromptReferences({ references, onRemove, onReorder, scale = 1, restoreFocus }: {
  references: readonly ImagePromptReference[];
  onRemove?: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  scale?: number;
  restoreFocus: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = references.filter(reference => reference.kind !== 'text').map(reference => reference.id);
  const sortable = Boolean(onReorder && ids.length > 1);

  return <DndContext sensors={sensors} collisionDetection={closestCenter}
    measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    autoScroll={{ canScroll: element => element.classList.contains('image-node-reference-viewport') }}
    accessibility={{ screenReaderInstructions: { draggable: '按空格或回车开始排序，方向键移动，空格或回车确认，Escape 取消。' } }}
    onDragStart={({ active, activatorEvent }) => {
      setDragging(true);
      setKeyboard(activatorEvent instanceof KeyboardEvent);
      setExpanded(String(active.id));
    }}
    onDragCancel={() => setDragging(false)}
    onDragEnd={({ active, over }) => {
      setDragging(false);
      const from = ids.indexOf(String(active.id));
      const to = over ? ids.indexOf(String(over.id)) : -1;
      if (sortable && from >= 0 && to >= 0 && from !== to) onReorder?.(arrayMove(ids, from, to));
    }}>
    <div className="image-node-reference-viewport nodrag nopan nowheel nokey"
      onClick={event => event.stopPropagation()} onWheel={event => {
        event.stopPropagation();
        if (event.deltaX || event.shiftKey || event.ctrlKey) return;
        const strip = event.currentTarget;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
        strip.scrollLeft += event.deltaY * unit;
      }}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <ul className="image-node-reference-strip" aria-label={references.some(reference => reference.kind === 'text') ? '连入的参考内容' : '连入的参考图'} data-keyboard={keyboard} data-dragging={dragging}>
          {references.map(reference => <SortableReference key={reference.id} reference={reference}
            expanded={expanded} setExpanded={setExpanded} keyboard={keyboard} setKeyboard={setKeyboard}
            disabled={!sortable || reference.kind === 'text'} scale={scale} reduceMotion={reduceMotion} onRemove={onRemove} restoreFocus={restoreFocus} />)}
        </ul>
      </SortableContext>
    </div>
  </DndContext>;
}

function SortableReference({ reference, expanded, setExpanded, keyboard, setKeyboard, disabled, scale, reduceMotion, onRemove, restoreFocus }: {
  reference: ImagePromptReference;
  expanded: string | null;
  setExpanded: Dispatch<SetStateAction<string | null>>;
  keyboard: boolean;
  setKeyboard: Dispatch<SetStateAction<boolean>>;
  disabled: boolean;
  scale: number;
  reduceMotion: boolean;
  onRemove?: (id: string) => void;
  restoreFocus: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: reference.id, disabled, transition: reduceMotion || keyboard ? null : { duration: 200, easing: 'ease' },
  });
  const open = expanded === reference.id || isDragging;
  const text = reference.kind === 'text';
  const role = reference.videoImageRole;
  const roleLabel = role === 'Ref' ? 'Reference' : role && `${role} frame`;
  const label = roleLabel ?? (text ? '参考文本' : reference.kind === 'video' ? '参考视频' : '参考图');
  // dnd kit measures screen pixels; CSS transforms inside a zoomed canvas use canvas units.
  const translate = transform ? CSS.Translate.toString({ ...transform, x: transform.x / scale, y: transform.y / scale }) : undefined;
  return <li ref={setNodeRef} {...listeners} className="image-node-reference" data-kind={reference.kind ?? 'image'} data-expanded={open}
    data-sortable={!disabled} data-dragging={isDragging} style={{ transform: translate, transition }}
    onPointerEnter={event => {
      if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        setKeyboard(false);
        setExpanded(reference.id);
      }
    }}
    onPointerLeave={event => {
      if (event.pointerType === 'mouse' && !event.currentTarget.querySelector(':focus-visible')) {
        setExpanded(current => current === reference.id ? null : current);
      }
    }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setExpanded(current => current === reference.id ? null : current);
      }
    }}
    onKeyDown={event => {
      listeners?.onKeyDown?.(event);
      if (event.defaultPrevented || isDragging) return;
      setKeyboard(true);
      if (event.key !== 'Escape' || !open) return;
      event.stopPropagation();
      event.currentTarget.querySelector('button')?.focus({ preventScroll: true });
      setExpanded(null);
    }}>
    <div className="image-node-reference-card">
      <button ref={setActivatorNodeRef} {...attributes} aria-disabled={undefined} type="button" className="image-node-reference-thumbnail" aria-label={`${label}：${reference.name}`}
        aria-roledescription={disabled ? undefined : attributes['aria-roledescription']}
        aria-describedby={disabled ? undefined : attributes['aria-describedby']}
        aria-expanded={open} onFocus={event => {
          if (event.currentTarget.matches(':focus-visible')) {
            setKeyboard(true);
            setExpanded(reference.id);
          }
        }} onClick={event => {
          if (event.detail === 0) {
            setKeyboard(true);
            setExpanded(open ? null : reference.id);
            return;
          }
          // Mouse hover owns the open state; touch can toggle it explicitly.
          if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            setKeyboard(false);
            setExpanded(open ? null : reference.id);
          }
        }}>
        <span className="image-node-reference-media">{text ? <svg className="image-node-reference-text-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v16M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M9 20h6" />
        </svg> : reference.kind === 'video' ? reference.url ? <video src={reference.url} muted playsInline preload="metadata" /> : <ImagePromptIcon name="video" /> : reference.url
          ? <img key={reference.url} src={reference.url} alt="" draggable={false} onLoad={reference.onLoad} />
          : <ImagePromptIcon name="image" />}</span>
        {role && <span className="video-frame-badge" data-role={role} aria-hidden="true">{role}</span>}
      </button>
      <span className="image-node-reference-details" aria-hidden={!open}>
        <span className="image-node-reference-name" title={reference.name}>{reference.name}</span>
        <span className="image-node-reference-type">{roleLabel ?? (text ? 'Text' : reference.kind === 'video' ? 'Video' : reference.url ? 'Image' : '等待上游图片')}</span>
      </span>
      {onRemove && <button type="button" className="image-node-reference-remove" aria-label={`移除${label}：${reference.name}`}
        aria-hidden={!open} disabled={!open}
        onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation(); }}
        onClick={event => {
          setExpanded(null);
          if (event.detail === 0) restoreFocus();
          onRemove(reference.id);
        }}><svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M9.83263 2.16737C10.0558 2.39052 10.0558 2.75233 9.83263 2.97549L2.97549 9.83263C2.75233 10.0558 2.39052 10.0558 2.16737 9.83263C1.94421 9.60948 1.94421 9.24767 2.16737 9.02451L9.02451 2.16737C9.24767 1.94421 9.60948 1.94421 9.83263 2.16737Z" fill="currentColor" />
          <path fillRule="evenodd" clipRule="evenodd" d="M2.16737 2.16737C2.39052 1.94421 2.75233 1.94421 2.97549 2.16737L9.83263 9.02451C10.0558 9.24767 10.0558 9.60948 9.83263 9.83263C9.60948 10.0558 9.24767 10.0558 9.02451 9.83263L2.16737 2.97549C1.94421 2.75233 1.94421 2.39052 2.16737 2.16737Z" fill="currentColor" />
        </svg></button>}
    </div>
  </li>;
}
