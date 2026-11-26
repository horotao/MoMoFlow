// Match the reference handle shader's 24px plane: 22px ring and a
// round-capped 8px cross with a 2px stroke, independent of toolbar icons.
export function OutputPortIcon() {
  return <svg className="image-node-output-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8M12 8v8" />
  </svg>;
}
