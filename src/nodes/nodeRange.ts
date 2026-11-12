/** Arc Elastic Slider constants, retained from the approved experiment. */
const physical = (duration: number, bounce: number, restDelta = .002) => {
  const root = 2 * Math.PI / (duration * 1.2);
  return { type: 'spring' as const, stiffness: root * root, damping: 2 * (1 - bounce) * root, restDelta, restSpeed: restDelta * 10 };
};
export const nodeRangeMotion = {
  thumb: physical(.26, 0),
  press: { type: 'spring' as const, visualDuration: .26, bounce: 0 },
  release: physical(.5, .42, .05),
  tag: { stiffness: 420, damping: 30, mass: .7 },
  enter: [.16, 1, .3, 1] as [number, number, number, number],
  exit: [.22, 1, .36, 1] as [number, number, number, number],
};
export const clampRange = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const rangePercent = (value: number, min: number, max: number) => (value - min) / (max - min || 1) * 100;
export const rangeRubber = (distance: number) => Math.sign(distance) * (1 - 1 / (Math.abs(distance) * .55 / 26 + 1)) * 26;
export function rangeDecimals(step: number, min: number) {
  return Math.min(15, Math.max(...[step, min].map(number => {
    const [base, exponent = '0'] = String(number).toLowerCase().split('e');
    return Math.max(0, (base.split('.')[1]?.length ?? 0) - Number(exponent));
  })));
}
export function snapRange(value: number, min: number, max: number, step: number) {
  return clampRange(Number((min + Math.round((value - min) / step) * step).toFixed(rangeDecimals(step, min))), min, max);
}
/** Detent reach is measured in local CSS pixels, including on a zoomed canvas. */
export function rangeDetent(percent: number, marks: readonly number[], min: number, max: number, width: number) {
  let best: number | undefined, gap = 8;
  for (const mark of marks) {
    if (mark < min || mark > max) continue;
    const distance = Math.abs((percent - rangePercent(mark, min, max)) / 100 * width);
    if (distance <= 7 + 1e-9 && distance < gap) { best = mark; gap = distance; }
  }
  return best;
}
