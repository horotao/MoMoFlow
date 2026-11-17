import { useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { AnnotationHoverPreview } from './AnnotationHoverPreview';
import type { annotationOutput } from './annotationGraph';
import { annotationLabel, annotationMarkup, type AnnotationMark as Mark } from './interactiveEdit';
import './shared/annotationStyle.css';

function AnnotationThumbnail({ url, mark }: { url: string; mark: Mark }) {
  const thumbnail = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = thumbnail.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const image = new Image();
    const { start, end } = mark;
    context.clearRect(0, 0, canvas.width, canvas.height);
    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      const side = Math.max(1, Math.min(width, height) * .18);
      const left = end ? Math.min(start.x, end.x) * width : Math.max(0, Math.min(width - side, start.x * width - side / 2));
      const top = end ? Math.min(start.y, end.y) * height : Math.max(0, Math.min(height - side, start.y * height - side / 2));
      const cropWidth = end ? Math.abs(start.x - end.x) * width : side;
      const cropHeight = end ? Math.abs(start.y - end.y) * height : side;
      const scale = canvas.width / Math.max(cropWidth, cropHeight);
      const drawWidth = cropWidth * scale, drawHeight = cropHeight * scale;
      context.drawImage(image, left, top, cropWidth, cropHeight,
        (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    };
    image.src = url;
    return () => { image.onload = null; };
  }, [mark, url]);
  return <canvas ref={thumbnail} width={64} height={64} className="annotation-chip-thumbnail" aria-hidden="true" />;
}

export function PromptAnnotationChip({ annotation, handleId, selected }: {
  annotation: ReturnType<typeof annotationOutput>; handleId: string; selected: boolean;
}) {
  const label = annotation ? annotationLabel(annotation.index) : '标注未连接';
  const description = annotation ? `${label} · ${annotationMarkup(annotation.mark)}` : label;

  const chip = <NodeViewWrapper as="span" className={`annotation-chip${selected ? ' is-selected' : ''}`}
    contentEditable={false} role="img" aria-label={description} data-handle-id={handleId}>
    {annotation ? <>
      <AnnotationThumbnail url={annotation.image.url} mark={annotation.mark} />
      <span className="annotation-chip-pin" aria-hidden="true"><span>{annotation.index + 1}</span></span>
    </> : <span className="annotation-chip-empty">{label}</span>}
  </NodeViewWrapper>;
  return annotation
    ? <AnnotationHoverPreview url={annotation.image.url} start={annotation.mark.start} end={annotation.mark.end} number={annotation.index + 1}>
      {chip}
    </AnnotationHoverPreview>
    : chip;
}
