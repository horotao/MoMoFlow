import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

type Point = { x: number; y: number };
type ImageSize = { width: number; height: number };

function previewLayout(size: ImageSize, start: Point, end?: Point) {
  const fit = Math.min(264 / size.width, 188 / size.height);
  const imageWidth = size.width * fit, imageHeight = size.height * fit;
  const width = Math.max(92, imageWidth), height = Math.max(80, imageHeight);
  const center = end ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } : start;
  const zoom = end
    ? Math.max(1, Math.min(2.65, .8 / Math.max(Math.abs(start.x - end.x), Math.abs(start.y - end.y))))
    : 2.65;

  function offset(frame: number, image: number, position: number) {
    const scaled = image * zoom;
    // Center the annotation until the image reaches an edge of the preview.
    return scaled <= frame ? (frame - scaled) / 2 : Math.max(frame - scaled, Math.min(0, frame / 2 - position * scaled));
  }

  const initialX = (width - imageWidth) / 2, initialY = (height - imageHeight) / 2;
  const focusedX = offset(width, imageWidth, center.x), focusedY = offset(height, imageHeight, center.y);
  const translate = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`;
  function pinPosition(x: number, y: number, scale: number) {
    const pinX = x + center.x * imageWidth * scale, pinY = y + center.y * imageHeight * scale;
    return translate(Math.max(4, Math.min(width - 24, pinX)), Math.max(23, Math.min(height - 4, pinY)) - 19);
  }

  return {
    width, height, imageWidth, imageHeight,
    imageFrom: translate(initialX, initialY),
    imageTo: `${translate(focusedX, focusedY)} scale(${zoom})`,
    pinFrom: pinPosition(initialX, initialY, 1),
    pinTo: pinPosition(focusedX, focusedY, zoom),
  };
}

export function AnnotationHoverPreview({ children, url, start, end, number }: {
  children: ReactElement;
  url: string;
  start: Point;
  end?: Point;
  number: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState<{ url: string; size: ImageSize }>();
  const anchor = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const size = loaded?.url === url ? loaded.size : undefined;

  useEffect(() => {
    if (open || !mounted) return;
    // Keep the view alive through a short exit so a new hover can reverse it.
    const timer = window.setTimeout(() => setMounted(false), 150);
    return () => window.clearTimeout(timer);
  }, [mounted, open]);

  const layout = previewLayout(size ?? { width: 264, height: 188 }, start, end);
  const imageStyle = {
    width: layout.imageWidth, height: layout.imageHeight,
    '--annotation-overview': layout.imageFrom, '--annotation-focused': layout.imageTo,
  } as CSSProperties;
  const pinStyle = { '--annotation-overview': layout.pinFrom, '--annotation-focused': layout.pinTo } as CSSProperties;

  const closeOutside = (event: PointerEvent<HTMLElement>) => {
    const trigger = anchor.current?.getBoundingClientRect();
    const popup = content.current?.getBoundingClientRect();
    if (!open || !trigger || !popup) return;
    const { clientX: x, clientY: y } = event;
    // A single large pointer move can skip Radix's hover corridor altogether.
    if (!event.relatedTarget || x < Math.min(trigger.left, popup.left) - 4 || x > Math.max(trigger.right, popup.right) + 4 ||
      y < Math.min(trigger.top, popup.top) - 4 || y > Math.max(trigger.bottom, popup.bottom) + 4) setOpen(false);
  };

  return <Tooltip.Root open={open} onOpenChange={next => {
    if (next) setMounted(true);
    setOpen(next);
  }}>
    <Tooltip.Trigger asChild ref={anchor} onPointerLeave={closeOutside}>{children}</Tooltip.Trigger>
    {mounted && <Tooltip.Portal forceMount>
      <Tooltip.Content ref={content} onPointerLeave={closeOutside} className="annotation-hover-preview" aria-label={`标注点 ${number} 预览`}
        side="top" sideOffset={10} collisionPadding={12} hideWhenDetached updatePositionStrategy="always" data-ready={Boolean(size)}>
        <div className="annotation-preview-window" style={{ width: layout.width, height: layout.height }} aria-hidden="true">
          <div className="annotation-preview-image" style={imageStyle}>
            <img src={url} alt="" draggable={false} onLoad={event => {
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
              setLoaded({ url, size: { width, height } });
            }} />
            {end && <svg className="annotation-preview-box" viewBox="0 0 1 1" preserveAspectRatio="none">
              <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(start.x - end.x)} height={Math.abs(start.y - end.y)}
                fill="none" vectorEffect="non-scaling-stroke" />
            </svg>}
          </div>
          <span className="annotation-chip-pin annotation-preview-pin" style={pinStyle}>{number}</span>
        </div>
      </Tooltip.Content>
    </Tooltip.Portal>}
  </Tooltip.Root>;
}
