import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon } from '@hugeicons/core-free-icons';
import './IteratorWarning.css';

export function IteratorWarning({ message }: { message: string }) {
  return <div className="iterator-warning nodrag nopan" role="status" aria-label="迭代提示">
    <HugeiconsIcon icon={AlertCircleIcon} size={16} aria-hidden="true" />
    <span>{message}</span>
  </div>;
}
