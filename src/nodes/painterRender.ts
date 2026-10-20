import type { PainterData, PaintStroke } from './painter';

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  return element;
}
function context(element: HTMLCanvasElement) {
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建绘图画布。');
  return ctx;
}
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: PaintStroke, width: number, height: number) {
  const points = stroke.points.map(p => ({ x: p.x * width, y: p.y * height }));
  if (!points.length) return;
  const first = points[0]; const last = points[points.length - 1];
  ctx.fillStyle = stroke.color; ctx.strokeStyle = stroke.color;
  ctx.lineWidth = Math.max(.5, stroke.size * width); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (stroke.tool === 'brush' || stroke.tool === 'eraser') {
    ctx.filter = stroke.hardness < 1 ? `blur(${stroke.size * width * (1 - stroke.hardness) / 4}px)` : 'none';
    if (points.length === 1) { ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(first.x, first.y); for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); ctx.stroke(); }
    ctx.filter = 'none';
    return;
  }
  const x = Math.min(first.x, last.x), y = Math.min(first.y, last.y);
  const w = Math.abs(last.x - first.x), h = Math.abs(last.y - first.y);
  if (stroke.tool === 'rectangle') ctx.rect(x, y, w, h);
  if (stroke.tool === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  if (stroke.tool === 'triangle') { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  if (stroke.tool === 'star') for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5; const radius = i % 2 ? .42 : 1;
    const px = x + w / 2 + Math.cos(angle) * w / 2 * radius;
    const py = y + h / 2 + Math.sin(angle) * h / 2 * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}
export function renderPainter(data: PainterData, image?: HTMLImageElement, draft?: PaintStroke, maxEdge = Infinity) {
  const sourceWidth = image?.naturalWidth || data.width, sourceHeight = image?.naturalHeight || data.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale)), height = Math.max(1, Math.round(sourceHeight * scale));
  const layer = canvas(width, height), temporary = canvas(width, height);
  const paint = context(layer), temp = context(temporary);
  for (const stroke of draft ? [...data.strokes, draft] : data.strokes) {
    temp.clearRect(0, 0, width, height);
    drawStroke(temp, stroke, width, height);
    paint.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    paint.globalAlpha = stroke.opacity; paint.drawImage(temporary, 0, 0);
  }
  const result = canvas(width, height), output = context(result);
  output.globalAlpha = data.backgroundOpacity; output.fillStyle = data.background; output.fillRect(0, 0, width, height);
  output.globalAlpha = 1;
  if (image) output.drawImage(image, 0, 0, width, height);
  output.drawImage(layer, 0, 0);
  paint.globalCompositeOperation = 'source-in'; paint.globalAlpha = 1; paint.fillStyle = '#ffffff'; paint.fillRect(0, 0, width, height);
  const mask = canvas(width, height), maskContext = context(mask);
  maskContext.fillStyle = '#000000'; maskContext.fillRect(0, 0, width, height); maskContext.drawImage(layer, 0, 0);
  // OpenAI image edits use transparent pixels for the white (painted) area.
  const alphaMask = canvas(width, height), alpha = context(alphaMask);
  alpha.fillStyle = '#000000'; alpha.fillRect(0, 0, width, height);
  alpha.globalCompositeOperation = 'destination-out'; alpha.drawImage(layer, 0, 0);
  return { result, mask, alphaMask, width, height };
}
export function painterBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法导出绘图。')), 'image/png'));
}
