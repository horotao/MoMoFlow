import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isAnnotationSource, selectedImageResult, withImageAnnotationHistories } from './annotationGraph';
import { activeFileAsset } from './fileCollection';
import { annotationLimit, commitAnnotations, fileAnnotationHistory, withFileAnnotationHistory, type AnnotationHistory, type AnnotationMark } from './interactiveEdit';
import { isFileNode, type AppNode, type FileAsset } from './types';

export function useImageAnnotations(id: string, asset: FileAsset | undefined, histories: AnnotationHistory[] | undefined, enabled: boolean) {
  const { setNodes } = useReactFlow<AppNode>();
  const [editingImage, setEditingImage] = useState<FileAsset>();
  const surface = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const editing = Boolean(enabled && asset && editingImage?.id === asset.id && editingImage.url === asset.url);
  const history = fileAnnotationHistory(histories, asset?.id);
  useEffect(() => {
    if (!editing) setEditingImage(undefined);
  }, [editing]);

  const changeAnnotations = (change: (history: AnnotationHistory, imageId: string) => AnnotationHistory) => {
    if (!editing || !asset) return;
    setNodes(nodes => nodes.map(node => {
      if (node.id !== id || !isAnnotationSource(node) || node.data.locked) return node;
      const current = isFileNode(node) ? activeFileAsset(node.data) : selectedImageResult(node);
      if (current?.id !== asset.id || current.url !== asset.url) return node;
      const history = fileAnnotationHistory(node.data.annotations, current.id);
      const next = change(history, current.id);
      return next === history ? node : withImageAnnotationHistories(node, withFileAnnotationHistory(node.data.annotations, next));
    }));
  };
  const editMarks = (change: (marks: AnnotationMark[]) => AnnotationMark[]) => changeAnnotations((history, imageId) => {
    const marks = history.frames[history.index];
    const next = change(marks);
    return marks === next ? history : commitAnnotations(history, imageId, next);
  });
  const toggle = () => {
    if (!enabled || !asset) return;
    setEditingImage(editing ? undefined : asset);
    if (editing) button.current?.focus({ preventScroll: true });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!editing || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      toggle();
    } else if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      changeAnnotations(history => {
        const index = history.index + (event.shiftKey ? 1 : -1);
        return index < 0 || index >= history.frames.length ? history : { ...history, index };
      });
      surface.current?.focus({ preventScroll: true });
    }
  };
  return { editing, button, toggle, onKeyDown, editor: {
    marks: history.frames[history.index], surface,
    onMark: (start: AnnotationMark['start'], end?: AnnotationMark['end']) => {
      const mark = { id: crypto.randomUUID(), start, end };
      editMarks(marks => marks.length >= annotationLimit ? marks : [...marks, mark]);
    },
    onMove: (mark: AnnotationMark) => editMarks(marks => marks.map(item => item.id === mark.id ? mark : item)),
    onRemove: (id: string) => {
      editMarks(marks => marks.filter(mark => mark.id !== id));
      surface.current?.focus({ preventScroll: true });
    },
  } };
}
