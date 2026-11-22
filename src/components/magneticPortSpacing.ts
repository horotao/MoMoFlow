// FLORA centers two 24px input planes with a 16px gap. Its 35% pull
// reduces their 40px center distance to 26px when approached between them.
export const inputPortSpacing = 40;
export const inputPortMinimumSpacing = 26;

/** Reduce only inward travel, so spacing never increases either port's pull. */
export function separateInputPorts(topY: number, bottomY: number, spacing: number, minimum: number): [number, number] {
  const overlap = minimum - (spacing + bottomY - topY);
  if (overlap <= 0) return [topY, bottomY];
  const topInward = Math.max(0, topY);
  const bottomInward = Math.max(0, -bottomY);
  const inward = topInward + bottomInward;
  if (!inward) return [topY, bottomY];
  const correction = Math.min(1, overlap / inward);
  return [topY - topInward * correction, bottomY + bottomInward * correction];
}
