import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { motion, useReducedMotion, useSpring, type MotionStyle } from 'motion/react';
import './GptSettingsControls.css';

// beUI Motion Tabs (segment): the bright label follows the spring indicator.
// https://beui.dev/components/motion/tabs
const segmentSpring = { stiffness: 245, damping: 36, mass: 1.2 };

export function GptSettingsSegments({ label, choices, labels = choices, value, disabled, onChange }: {
  label: string; choices: readonly string[]; labels?: readonly string[];
  value: string; disabled?: boolean; onChange: (value: string) => void;
}) {
  const name = useId();
  const group = useRef<HTMLDivElement>(null);
  const selected = choices.indexOf(value);
  const previous = useRef(selected);
  const reduce = useReducedMotion();
  const position = useSpring(selected, segmentSpring);
  useLayoutEffect(() => {
    if (reduce || disabled || previous.current < 0 || selected < 0 || group.current?.querySelector('input:focus-visible')) {
      position.jump(selected);
    } else position.set(selected);
    previous.current = selected;
  }, [selected, choices.length, position, reduce, disabled]);

  return <motion.div ref={group} className="gpt-segments" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}
    style={{ '--segments': choices.length, '--segment-position': reduce ? selected : position } as MotionStyle}>
    {selected >= 0 && <div className="gpt-segment-indicator" aria-hidden="true" />}
    {choices.map((choice, index) => (
      <label key={choice} className="gpt-segment" style={{ '--segment-index': index } as CSSProperties}>
        <input type="radio" name={name} disabled={disabled} checked={selected === index} onChange={() => onChange(choice)} />
        <span className="gpt-segment-label">{labels[index]}</span>
        {selected >= 0 && <span className="gpt-segment-active-label" aria-hidden="true">{labels[index]}</span>}
      </label>
    ))}
  </motion.div>;
}
