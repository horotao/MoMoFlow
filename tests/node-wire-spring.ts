import { frame } from 'motion';
import { curveOptions } from '../src/edges/curve';
import { bouncingCable } from '../src/edges/magneticGeometry';
import { aimWireFollower, createWireFollower, nodeWireResponse, restingWireLag } from '../src/edges/nodeWireSpring';

type Point = { x: number; y: number };

const canvas = document.querySelector<HTMLElement>('.canvas')!;
const slider = document.querySelector<HTMLInputElement>('#strength')!;
const strengthValue = document.querySelector<HTMLOutputElement>('#strength-value')!;
const presets = document.querySelectorAll<HTMLButtonElement>('[data-strength]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const nodes = Array.from(canvas.querySelectorAll<HTMLElement>('.node'), element => ({
  element,
  position: { x: 0, y: 0 },
  follower: createWireFollower(restingWireLag),
  travel: { x: 0, y: 0 },
}));
type Node = typeof nodes[number];

function pin(node: Node, side: 'in' | 'out') {
  return { node, element: node.element.querySelector<HTMLElement>(`.port.${side}`)!, offset: { x: 0, y: 0 } };
}
type Pin = ReturnType<typeof pin>;

const wires = [
  { path: canvas.querySelector<SVGPathElement>('path.text-wire')!, source: pin(nodes[0], 'out'), target: pin(nodes[1], 'in') },
  { path: canvas.querySelector<SVGPathElement>('path.image-wire')!, source: pin(nodes[1], 'out'), target: pin(nodes[2], 'in') },
];

const margin = 16;
let strength = slider.valueAsNumber / 100;
let wideLayout: boolean | undefined;
let drag: { node: Node; pointer: number; offset: Point } | undefined;

function pinPosition({ node, offset }: Pin): Point {
  return { x: node.position.x + offset.x, y: node.position.y + offset.y };
}

function wireLag({ position, follower }: Node): Point {
  return { x: follower.x.get() - position.x, y: follower.y.get() - position.y };
}

function draw() {
  for (const { element, position } of nodes) {
    element.style.transform = `translate(${position.x}px, ${position.y}px)`;
  }

  for (const { path, source, target } of wires) {
    const from = pinPosition(source);
    const to = pinPosition(target);
    const { deflection, widthScale } = nodeWireResponse(from, to, wireLag(source.node), wireLag(target.node), reducedMotion.matches ? 0 : strength);
    path.setAttribute('d', bouncingCable(from, to, 0, false, 100, [deflection], curveOptions));
    path.style.strokeWidth = `${2 * widthScale}px`;
  }
}

const queueDraw = () => frame.render(draw);

function move(node: Node, position: Point, withSpring = false) {
  const next = {
    x: clamp(position.x, margin, margin + node.travel.x),
    y: clamp(position.y, margin, margin + node.travel.y),
  };
  if (withSpring && next.x === node.position.x && next.y === node.position.y) return;
  node.position = next;
  aimWireFollower(node.follower, next, withSpring && strength > 0 && !reducedMotion.matches);
  queueDraw();
}

function endDrag() {
  if (!drag) return;
  const { node, pointer } = drag;
  drag = undefined;
  node.element.classList.remove('dragging');
  if (node.element.hasPointerCapture(pointer)) node.element.releasePointerCapture(pointer);
}

function arrange(reset: boolean) {
  endDrag();
  const wide = matchMedia('(min-width: 641px)').matches;
  const useStart = reset || wideLayout !== wide;
  const starts = wide
    ? [{ x: 0.15, y: 0.31 }, { x: 0.5, y: 0.57 }, { x: 0.85, y: 0.37 }]
    : [{ x: 0.11, y: 0.12 }, { x: 0.78, y: 0.50 }, { x: 0.32, y: 0.87 }];
  for (const [index, node] of nodes.entries()) {
    const { position, travel, element } = node;
    const fraction = useStart ? starts[index] : {
      x: travel.x > 0 ? (position.x - margin) / travel.x : starts[index].x,
      y: travel.y > 0 ? (position.y - margin) / travel.y : starts[index].y,
    };
    node.travel = {
      x: Math.max(0, canvas.clientWidth - element.offsetWidth - margin * 2),
      y: Math.max(0, canvas.clientHeight - element.offsetHeight - margin * 2),
    };
    move(node, { x: margin + node.travel.x * fraction.x, y: margin + node.travel.y * fraction.y });
  }
  for (const { source, target } of wires) {
    for (const pin of [source, target]) {
      const box = pin.element.getBoundingClientRect();
      const nodeBox = pin.node.element.getBoundingClientRect();
      pin.offset = { x: box.left - nodeBox.left + box.width / 2, y: box.top - nodeBox.top + box.height / 2 };
    }
  }
  wideLayout = wide;
  canvas.classList.add('ready');
}

const direction: Record<string, Point> = {
  ArrowLeft: { x: -12, y: 0 }, ArrowRight: { x: 12, y: 0 },
  ArrowUp: { x: 0, y: -12 }, ArrowDown: { x: 0, y: 12 },
};

for (const node of nodes) {
  const { element, follower } = node;
  follower.x.on('change', queueDraw);
  follower.y.on('change', queueDraw);
  element.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0) return;
    event.preventDefault();
    element.focus({ preventScroll: true });
    const { x, y } = node.position;
    drag = { node, pointer: event.pointerId, offset: { x: event.clientX - x, y: event.clientY - y } };
    element.setPointerCapture(event.pointerId);
    element.classList.add('dragging');
  });
  element.addEventListener('keydown', event => {
    if (!Object.hasOwn(direction, event.key) || drag) return;
    event.preventDefault();
    const { x, y } = direction[event.key];
    move(node, { x: node.position.x + x, y: node.position.y + y });
  });
}

function trackPointer(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer) return;
  move(drag.node, { x: event.clientX - drag.offset.x, y: event.clientY - drag.offset.y }, true);
}

canvas.addEventListener('pointermove', trackPointer);
canvas.addEventListener('pointerup', event => {
  if (drag?.pointer !== event.pointerId) return;
  trackPointer(event);
  endDrag();
});
for (const type of ['pointercancel', 'lostpointercapture'] as const) {
  canvas.addEventListener(type, event => {
    if (drag?.pointer === event.pointerId) endDrag();
  });
}
window.addEventListener('blur', endDrag);

function updateStrength() {
  strength = slider.valueAsNumber / 100;
  strengthValue.value = `${slider.value}%`;
  for (const button of presets) button.setAttribute('aria-pressed', String(button.dataset.strength === slider.value));
  if (strength === 0) {
    for (const node of nodes) move(node, node.position);
  }
  queueDraw();
}

function updateMotionPreference() {
  document.querySelector<HTMLElement>('#reduced-motion')!.hidden = !reducedMotion.matches;
  if (reducedMotion.matches) {
    for (const node of nodes) move(node, node.position);
  }
  queueDraw();
}

slider.addEventListener('input', updateStrength);
for (const button of presets) {
  button.addEventListener('click', () => {
    slider.value = button.dataset.strength!;
    updateStrength();
  });
}
document.querySelector('#reset')!.addEventListener('click', () => arrange(true));
reducedMotion.addEventListener('change', updateMotionPreference);
new ResizeObserver(() => arrange(false)).observe(canvas);
updateMotionPreference();
updateStrength();
