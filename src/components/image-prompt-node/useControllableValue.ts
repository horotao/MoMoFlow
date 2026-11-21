import { useState } from 'react';

export function useControllableValue<T>(value: T | undefined, defaultValue: T, onChange?: (value: T) => void) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value === undefined ? internalValue : value;
  function update(nextValue: T) {
    if (Object.is(nextValue, currentValue)) return;
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  }
  return [currentValue, update] as const;
}
