import { useCallback, useEffect, useRef, useState } from 'react';

export type AddNodeType = 'image' | 'text';

export const nodePreviewDescription = {
  image: '输入提示词生成图片，也可以用参考图引导构图、风格和后续编辑。',
  text: '撰写或生成提示词、文案和 Markdown，并将结果连到下游节点。',
};

const enterDelay = 200;
const leaveDelay = 80;

interface Preview {
  type: AddNodeType;
  anchor: HTMLElement;
  open: boolean;
}

export function supportsNodePreview(pointerType: string) {
  return pointerType !== 'touch' && window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches;
}

export function useAddNodePreview() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const current = useRef<Preview | null>(null);
  const opening = useRef<number>();
  const closing = useRef<number>();

  const update = useCallback((next: Preview | null) => {
    current.current = next;
    setPreview(next);
  }, []);
  const cancelTimers = useCallback(() => {
    window.clearTimeout(opening.current);
    window.clearTimeout(closing.current);
    opening.current = closing.current = undefined;
  }, []);
  const reset = useCallback(() => {
    cancelTimers();
    update(null);
  }, [cancelTimers, update]);

  useEffect(() => {
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('blur', reset);
      cancelTimers();
    };
  }, [cancelTimers, reset]);

  function keepOpen() {
    cancelTimers();
    if (current.current && !current.current.open) update({ ...current.current, open: true });
  }

  function leave() {
    window.clearTimeout(opening.current);
    opening.current = undefined;
    if (!current.current?.open || closing.current !== undefined) return;
    closing.current = window.setTimeout(() => {
      closing.current = undefined;
      if (current.current?.open) update({ ...current.current, open: false });
    }, leaveDelay);
  }

  function enter(type: AddNodeType, anchor: HTMLElement) {
    if (current.current?.anchor === anchor) {
      keepOpen();
      return;
    }
    leave();
    opening.current = window.setTimeout(() => {
      opening.current = undefined;
      if (anchor.isConnected) update({ type, anchor, open: true });
    }, enterDelay);
  }

  function finishExit() {
    if (current.current && !current.current.open) update(null);
  }

  return { preview, enter, leave, keepOpen, reset, finishExit };
}
