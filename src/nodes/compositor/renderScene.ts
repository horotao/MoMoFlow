import { graphicPadding } from '../compositorGraphics';
import type { CompositorDocument, CompositorLayout } from '../compositor';

// The editor, node preview and PNG all pass through this same drawing function.
export function drawCompositor(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, document: CompositorDocument,
  layout: CompositorLayout, images: Map<string, CanvasImageSource>, scale = 1) {
  context.save();
  context.scale(scale, scale);
  context.clearRect(0, 0, layout.width, layout.height);
  if (document.canvas.fill) { context.fillStyle = document.canvas.fill; context.fillRect(0, 0, layout.width, layout.height); }
  for (const layer of layout.layers) {
    const image = images.get(layer.id);
    if (!layer.visible || !image) continue;
    const t = layer.transform;
    context.save();
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = layer.blendMode;
    context.translate(t.x + t.width / 2, t.y + t.height / 2);
    context.rotate(t.rotation * Math.PI / 180);
    const padding = graphicPadding(layer);
    context.drawImage(image, -t.width / 2 - padding, -t.height / 2 - padding, t.width + padding * 2, t.height + padding * 2);
    if (layer.stroke.enabled && layer.stroke.width > 0 && (layer.source.kind === 'input' || layer.source.kind === 'asset')) {
      context.strokeStyle = layer.stroke.color; context.lineWidth = layer.stroke.width;
      const inset = layer.stroke.width / 2;
      context.strokeRect(-t.width / 2 + inset, -t.height / 2 + inset, Math.max(0, t.width - layer.stroke.width), Math.max(0, t.height - layer.stroke.width));
    }
    context.restore();
  }
  context.restore();
}
