// Exercise the real canvas keyboard handler without relying on toolbar buttons.
export function canvasHistoryShortcut(action: 'undo' | 'redo') {
  const canvas = document.querySelector<HTMLElement>('.react-flow');
  if (!canvas) throw new Error('Canvas must be mounted before using history shortcuts');
  canvas.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z',
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey: action === 'redo',
    bubbles: true,
    cancelable: true,
  }));
}
