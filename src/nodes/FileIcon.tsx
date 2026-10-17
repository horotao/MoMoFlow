export function FileIcon({ name }: { name: 'single' | 'grid' | 'previous' | 'next' | 'order' | 'download' | 'fullscreen' | 'close' }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'single' && <><rect x="6.5" y="6.5" width="11" height="11" rx="1" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>}
    {name === 'grid' && <>{[6.5, 13.5].flatMap((x) => [6.5, 13.5].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />))}</>}
    {name === 'previous' && <path d="m13 10-2 2 2 2" />}
    {name === 'next' && <path d="m11 10 2 2-2 2" />}
    {name === 'order' && <path d="M7.5 6.5v11m-2-2 2 2 2-2M12.5 7.5h5m-5 3h5m-5 3h5m-5 3h5" />}
    {name === 'download' && <path d="M6.5 13.5v3a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M12 6.5v7m-3-3 3 3 3-3" />}
    {name === 'fullscreen' && <path d="M13.5 6.5h4v4m0-4-7 7M10.5 17.5h-4v-4m0 4 7-7" />}
    {name === 'close' && <path d="m7.5 7.5 9 9m0-9-9 9" />}
  </svg>;
}
