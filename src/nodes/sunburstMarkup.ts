import type { SunburstMarkupMark } from './sunburst.ts';

export async function renderSunburstMarkup(original: Blob, marks: SunburstMarkupMark[], signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' });
  const { width, height } = bitmap;
  bitmap.close();
  signal.throwIfAborted();
  if (width * height > 16_777_216) throw new Error('交互编辑标注图最多支持 16,777,216 像素，请先缩小原图。');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建交互编辑标注图。');
  const scale = Math.min(width, height);
  const stroke = Math.max(1, scale * .006);
  const radius = Math.max(2, scale * .028);
  const fontSize = Math.max(3, Math.round(scale * .022));
  const red = '#f02032';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textBaseline = 'top';
  marks.forEach(({ start, end }, index) => {
    const x = start.x * width;
    const y = start.y * height;
    let left = x + radius;
    let top = y - radius;
    ctx.beginPath();
    if (end) {
      const endX = end.x * width;
      const endY = end.y * height;
      left = Math.min(x, endX);
      top = Math.min(y, endY);
      ctx.rect(left, top, Math.abs(endX - x), Math.abs(endY - y));
    } else {
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = stroke * 1.7;
    ctx.stroke();
    ctx.strokeStyle = red;
    ctx.lineWidth = stroke;
    ctx.stroke();

    const number = String(index + 1);
    const labelWidth = ctx.measureText(number).width + stroke * 2;
    const labelHeight = fontSize + stroke * 2;
    const labelX = Math.max(0, Math.min(width - labelWidth, left));
    const labelY = Math.max(0, Math.min(height - labelHeight, top - labelHeight - stroke));
    ctx.fillStyle = '#fff';
    ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
    ctx.fillStyle = red;
    ctx.fillText(number, labelX + stroke, labelY + stroke);
  });

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法导出交互编辑标注图。')), 'image/png');
  });
  signal.throwIfAborted();
  return png;
}
