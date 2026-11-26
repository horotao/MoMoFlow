import { useEffect, useLayoutEffect, useRef } from 'react';
import { isCanvasAudio, isCanvasImageNode, isCanvasTextNode, isCanvasVideo, isNodeLocked, type AppNode } from './types';

export function requestNodeCommand(id: string, command: 'rename' | 'replace') {
  window.dispatchEvent(new Event(`momoflow:node:${id}:${command}`));
}

export function useNodeCommand(id: string | null, command: 'rename' | 'replace', run: () => void) {
  const latest = useRef(run);
  useLayoutEffect(() => { latest.current = run; }, [run]);
  useEffect(() => {
    if (!id) return;
    const type = `momoflow:node:${id}:${command}`;
    const listener = () => latest.current();
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }, [id, command]);
}

export function hasNodeContents(node: AppNode) {
  if (isCanvasImageNode(node)) return Boolean(node.data.results?.length || node.data.composer.prompt);
  if (isCanvasTextNode(node)) return Boolean(node.data.text || node.data.textHistory?.length || node.data.textComposer.prompt);
  if (isCanvasVideo(node)) return Boolean(node.data.asset || node.data.lastFrame || node.data.videoComposer?.prompt);
  return isCanvasAudio(node) && Boolean(node.data.audioHistory?.length || node.data.audioComposer?.prompt);
}

export function clearNodeContents(node: AppNode): AppNode {
  if (isNodeLocked(node) || !hasNodeContents(node)) return node;
  if (isCanvasImageNode(node)) return { ...node, data: { ...node.data, results: [], activeResultId: undefined,
    sourceSignature: undefined, annotations: undefined, composer: { ...node.data.composer, prompt: '', mentions: undefined } } };
  if (isCanvasTextNode(node)) return { ...node, data: { ...node.data, text: '', content: undefined, textHistory: [],
    textGeneration: undefined, activeTextResultId: undefined, textComposer: { ...node.data.textComposer, prompt: '', mentions: undefined } } };
  if (isCanvasVideo(node)) return { ...node, data: { ...node.data, asset: undefined, lastFrame: undefined,
    videoComposer: node.data.videoComposer && { ...node.data.videoComposer, prompt: '', mentions: undefined } } };
  if (isCanvasAudio(node)) return { ...node, data: { ...node.data, audioHistory: [], activeAudioId: undefined,
    audioComposer: node.data.audioComposer && { ...node.data.audioComposer, prompt: '' } } };
  return node;
}
