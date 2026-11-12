/** Browser fixture: only native pointer capture is stubbed for synthetic events. */
export function rangePointer(slider: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', value?: number) {
  const root = slider.closest<HTMLElement>('.node-range-input')!;
  const control = root.querySelector<HTMLElement>('.node-range-control')!;
  const rail = root.querySelector<HTMLElement>('.node-range-rail')!.getBoundingClientRect();
  const thumb = slider.getBoundingClientRect();
  const min = Number(slider.getAttribute('aria-valuemin')), max = Number(slider.getAttribute('aria-valuemax'));
  const target = type === 'pointerdown' && value === undefined ? slider : control;
  control.setPointerCapture = () => {};
  try {
    target.dispatchEvent(new PointerEvent(type, { button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true, bubbles: true, cancelable: true,
      clientX: value === undefined ? thumb.left + thumb.width / 2 : rail.left + (value - min) / (max - min) * rail.width, clientY: rail.top + rail.height / 2 }));
  } finally { Reflect.deleteProperty(control, 'setPointerCapture'); }
}
