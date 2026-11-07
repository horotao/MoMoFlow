// Speed sets the base tempo. Rigidity adds resistance to bending and suppresses
// oscillation; impact strength remains a separate impulse at release.
export function cableSpring(speed: number, rigidity: number, phase: 'drag' | 'release') {
  const amount = Math.max(0, Math.min(100, rigidity)) / 100;
  const resistance = 2 ** (amount * 2 - 1);
  const stiffness = speed * (phase === 'release' ? 0.62 : 1) * resistance;
  if (phase === 'drag') {
    return { stiffness, damping: 2 * Math.sqrt(stiffness) * (0.5 + amount * 0.44), mass: 0.65 };
  }
  const dampingRatio = amount <= 0.5 ? 0.2 + amount * 0.36 : 0.38 + (amount - 0.5) * 1.24;
  return { stiffness, damping: 2 * Math.sqrt(stiffness * 0.85) * dampingRatio, mass: 0.85 };
}
