import { useCallback, useEffect, useRef, useState } from 'react';

export const addNodeEntries = [
  { type: 'image', label: '图片', description: '生成和编辑图片', key: 'I' },
  { type: 'text', label: '文本', description: '生成文本与 Markdown', key: 'T' },
  { type: 'video', label: '视频', description: '生成和编辑视频', key: 'V' },
  { type: 'audio', label: '音频', description: '生成和编辑音频', key: 'A' },
] as const;
export type AddNodeType = typeof addNodeEntries[number]['type'];

export const nodePreviewDescription = {
  image: '输入提示词生成图片，也可以用参考图引导构图、风格和后续编辑。',
  video: '连接文字、图片或视频，选择模型、比例和时长后运行本地预览，也可直接导入 MP4。',
  audio: '输入或连接音乐描述，使用 Suno V6 生成人声歌曲或纯音乐。',
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
