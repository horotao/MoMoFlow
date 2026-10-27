// Imported opaque masks use WaveSpeed black = edit. App luminance masks use
// white = edit; alpha masks use transparent = edit. Normalize to opaque B/W.
export function normalizeIdeogramMask(pixels: Uint8ClampedArray, mode?: 'luminance') {
  let alphaMask = false, editable = false, preserved = false;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) { alphaMask = true; break; }
  for (let i = 0; i < pixels.length; i += 4) {
    // Integer weights keep exact gray 128 at the threshold, matching alpha 127.
    const luminance = (299 * pixels[i] + 587 * pixels[i + 1] + 114 * pixels[i + 2]) / 1000;
    const edit = alphaMask ? pixels[i + 3] < 128 : mode === 'luminance' ? luminance >= 128 : luminance < 128;
    if (edit) editable = true; else preserved = true;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = edit ? 0 : 255;
    pixels[i + 3] = 255;
  }
  if (!editable || !preserved) throw new Error('Mask 必须同时包含要修改和要保留的区域，不能全黑、全白或全透明。');
}
