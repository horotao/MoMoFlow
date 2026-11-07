// Convert nominal 100% sizes to flow coordinates: shrink with nodes below 100%,
// and keep the existing screen-size cap when zoomed in.
export function magneticSizeScale(zoom: number) {
  return 1 / Math.max(1, zoom);
}
