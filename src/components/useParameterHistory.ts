import { useContext, type KeyboardEvent } from 'react';
import { CanvasHistoryContext } from './useCanvasHistory';

/** Capture before individual controls isolate their keys from the canvas. */
export function useParameterHistory(cancelDraft?: () => void) {
  const history = useContext(CanvasHistoryContext);
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey
      || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    // Text fields own their editing history; sliders and buttons use canvas history.
    if ((event.target as HTMLElement).closest('input:not([type="range"]),textarea,[contenteditable="true"],[data-compositor-editor]')) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDraft?.();
    if (event.shiftKey) history.redo(); else history.undo();
  };
}
