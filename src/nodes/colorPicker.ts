export function colorFromHex(hex: string) {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: hue * 60, s: max ? delta / max : 0, v: max };
}

export function colorToHex(h: number, s: number, v: number) {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

export function normalizeHexColor(text: string) {
  const value = text.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  if (/^[\da-f]{3}$/i.test(value)) return `#${value.split('').map(char => char + char).join('').toLowerCase()}`;
  return undefined;
}
