import type { CompositorLayer } from '../compositor';
import { pathCommands, wrapText, type GraphicSource } from '../compositorGraphics';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function drawGraphic(ctx: Context, source: GraphicSource, width: number, height: number, stroke: CompositorLayer['stroke']) {
  ctx.save();
  ctx.lineWidth = stroke.width; ctx.strokeStyle = stroke.color;
  ctx.lineJoin = stroke.join ?? 'miter'; ctx.lineCap = stroke.cap ?? 'butt';
  if (source.fill) ctx.fillStyle = source.fill;
  const outlined = stroke.enabled && stroke.width > 0;
  if (source.kind === 'text') {
    ctx.font = `${source.fontStyle} ${source.fontWeight} ${source.fontSize}px "${source.fontFamily}"`;
    ctx.textBaseline = 'alphabetic';
    const measure = (text: string) => ctx.measureText(text).width + Math.max(0, Array.from(text).length - 1) * source.letterSpacing;
    const lines = wrapText(source.text, width, measure), lineHeight = source.fontSize * source.lineHeight;
    const metrics = ctx.measureText('Mg'), ascent = metrics.fontBoundingBoxAscent || source.fontSize * .8, descent = metrics.fontBoundingBoxDescent || source.fontSize * .2;
    const top = source.verticalAlign === 'center' ? (height - lines.length * lineHeight) / 2 : source.verticalAlign === 'bottom' ? height - lines.length * lineHeight : 0;
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    lines.forEach((line, index) => {
      const y = top + index * lineHeight + (lineHeight - ascent - descent) / 2 + ascent;
      let x = source.align === 'center' ? (width - measure(line)) / 2 : source.align === 'right' ? width - measure(line) : 0;
      if (!source.letterSpacing) {
        if (source.fill) ctx.fillText(line, x, y);
        if (outlined) ctx.strokeText(line, x, y);
      } else for (const char of Array.from(line)) {
        if (source.fill) ctx.fillText(char, x, y);
        if (outlined) ctx.strokeText(char, x, y);
        x += ctx.measureText(char).width + source.letterSpacing;
      }
    });
  } else {
    const path = new Path2D();
    const inset = outlined ? Math.min(stroke.width / 2, width / 2, height / 2) : 0;
    if (source.kind === 'path') path.addPath(new Path2D(pathCommands(source.points, source.closed, width, height)));
    else if (source.shape === 'rectangle') path.rect(inset, inset, Math.max(0, width - 2 * inset), Math.max(0, height - 2 * inset));
    else if (source.shape === 'ellipse') path.ellipse(width / 2, height / 2, Math.max(0, width / 2 - inset), Math.max(0, height / 2 - inset), 0, 0, 2 * Math.PI);
    else {
      const count = source.shape === 'star' ? 10 : 3;
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / count, radius = source.shape === 'star' && i % 2 ? .45 : 1;
        const x = width / 2 + Math.cos(a) * (width / 2 - inset) * radius, y = height / 2 + Math.sin(a) * (height / 2 - inset) * radius;
        if (!i) path.moveTo(x, y); else path.lineTo(x, y);
      }
      path.closePath();
    }
    if (source.fill) ctx.fill(path);
    if (outlined) ctx.stroke(path);
  }
  ctx.restore();
}

let inter: Promise<void> | undefined;
export function ensureGraphicFonts(sources: GraphicSource[]) {
  if (!sources.some(source => source.kind === 'text' && source.fontFamily === 'Text Node Inter')) return Promise.resolve();
  if (!inter) inter = (async () => {
    const face = new FontFace('Text Node Inter', 'url(/text-node/Inter.ttf)', { weight: '100 900' });
    await face.load();
    (self as unknown as { fonts: FontFaceSet }).fonts.add(face);
  })().catch(error => { inter = undefined; throw error; });
  return inter;
}
