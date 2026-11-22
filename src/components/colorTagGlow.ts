// Flora's screen-space tag highlight: 16px reach, 2px inset ring,
// 0.5 peak opacity and a quadratic falloff, capped at a quarter of the node.
export function colorTagGlowMetrics(zoom: number, width: number, height: number) {
  const scale = Math.max(zoom, 0.01);
  return { reach: Math.min(16 / scale, Math.min(width, height) / 4), ring: 2 / scale };
}

// Half-screen-pixel bands reproduce the shader's falloff without adding a GL renderer.
// Correct each band's alpha for the wider translucent bands underneath it.
export function colorTagGlowShadow(color: string, reach: number) {
  // Color 4 keeps fractional alpha precision; legacy rgba() quantizes the
  // faint outer bands to 8-bit alpha before they have been composited.
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255).join(' ');
  return Array.from({ length: 32 }, (_, index) => {
    const alpha = 0.5 * (1 - (index + 0.5) / 32) ** 2;
    const beneath = index === 31 ? 0 : 0.5 * (1 - (index + 1.5) / 32) ** 2;
    const opacity = (alpha - beneath) / (1 - beneath);
    return `0 0 0 ${reach * (index + 1) / 32}px color(srgb ${rgb} / ${opacity})`;
  }).join(',');
}
