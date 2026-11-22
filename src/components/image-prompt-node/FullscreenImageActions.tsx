import { cloneElement, createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Check, ChevronRight, Copy, Download } from 'lucide-react';
import type { ImageDownloadFormat } from '../../nodes/fileMedia';

const FullscreenPortal = createContext<HTMLElement | null>(null);
export function FullscreenTooltipScope({ portal, children }: { portal: HTMLElement | null; children: ReactNode }) {
  return <FullscreenPortal.Provider value={portal}><Tooltip.Provider delayDuration={80} skipDelayDuration={100}>{children}</Tooltip.Provider></FullscreenPortal.Provider>;
}
export function FullscreenTip({ label, children }: { label: string; children: ReactElement<{ title?: string }> }) {
  const portal = useContext(FullscreenPortal);
  return <Tooltip.Root><Tooltip.Trigger asChild>{cloneElement(children, { title: undefined })}</Tooltip.Trigger><Tooltip.Portal container={portal}><Tooltip.Content side="top" sideOffset={4} collisionPadding={8} className="image-fullscreen-tooltip">{label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

export function FullscreenCopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const text = failed ? 'Copy failed, retry' : copied ? 'Copied' : label;
  return <FullscreenTip label={text}><button type="button" aria-label={text}
    disabled={!value} onClick={async () => {
      try {
        await navigator.clipboard.writeText(value); setCopied(true); setFailed(false);
        clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500);
      } catch { setFailed(true); }
    }}>{copied ? <Check /> : <Copy />}</button></FullscreenTip>;
}

export function FullscreenDownloadMenu({ portal, onDownload, onDownloadAll, downloading = false, batch = false, label }: {
  portal: HTMLElement | null; onDownload: (format: ImageDownloadFormat) => void; onDownloadAll?: () => void; downloading?: boolean; batch?: boolean; label?: string;
}) {
  const formats = <>{(['PNG', 'JPG', 'WEBP'] as const).map((format, index) => <DropdownMenu.Item key={format} onSelect={() => onDownload(format)}><span>{format}</span><span>{index + 1}</span></DropdownMenu.Item>)}<DropdownMenu.Item><span>SVG</span><span>4</span></DropdownMenu.Item></>;
  return <DropdownMenu.Root modal={false}>
    <FullscreenTip label={label ?? 'Download'}><DropdownMenu.Trigger asChild><button type="button" aria-label={label ?? (batch ? 'Batch download actions' : 'Download')}><Download /></button></DropdownMenu.Trigger></FullscreenTip>
    <DropdownMenu.Portal container={portal}><DropdownMenu.Content className={`image-fullscreen-menu${batch ? '' : ' image-fullscreen-format-menu'}`} sideOffset={3} align="center"
      onEscapeKeyDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {batch ? <><DropdownMenu.Sub><DropdownMenu.SubTrigger><span>Download</span><ChevronRight /></DropdownMenu.SubTrigger>
        <DropdownMenu.Portal container={portal}><DropdownMenu.SubContent className="image-fullscreen-menu image-fullscreen-format-menu" sideOffset={3} alignOffset={0} onKeyDown={event => event.stopPropagation()}>{formats}</DropdownMenu.SubContent></DropdownMenu.Portal>
      </DropdownMenu.Sub><DropdownMenu.Item disabled={downloading || !onDownloadAll} onSelect={onDownloadAll}><span>Download all</span></DropdownMenu.Item></> : formats}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
