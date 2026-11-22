import type { Edge } from '@xyflow/react';
import { canConnect, imageInputHandles, isImageInputHandle } from './connectionRules.ts';
import { isCanvasImageNode, isCanvasTextNode, isNodeLocked, type AppNode, type PromptMention } from './types.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { connectImageReferenceRatio } from './imageReferenceRatio.ts';
import { validPromptMentions } from './promptMentionText.ts';
export { validPromptMentions } from './promptMentionText.ts';

export interface MentionEdit { prompt: string; mentions: PromptMention[] }
export type MentionSources = string | readonly string[];
export interface MentionCandidate { id: string; name: string; url?: string; connected: boolean; disabled?: string }

export function mentionCandidates(target: string, nodes: AppNode[], edges: Edge[]): MentionCandidate[] {
  const occupied = edges.filter(edge => edge.target === target && isImageInputHandle(edge.targetHandle));
  const handle = imageInputHandles.find(handle => !occupied.some(edge => edge.targetHandle === handle));
  // Nodes are appended when added to this canvas. File completion dates do
  // not describe that order, and newly created empty Images belong first too.
  return nodes.filter(isCanvasImageNode).filter(node => node.id !== target).reverse().map(node => {
    const asset = selectedImageResult(node);
    const connected = occupied.some(edge => edge.source === node.id);
    const disabled = isNodeLocked(node) ? '节点已锁定' : !connected && !handle ? '最多连接 16 张图片'
      : !connected && !canConnect({ source: node.id, target, sourceHandle: 'result', targetHandle: handle! }, nodes, edges) ? '无法连接：会形成环路或目标已锁定' : undefined;
    return { id: node.id, name: node.data.label || asset?.name || 'Image', url: asset?.url, connected, disabled };
  });
}

/** A mention and its real model input are committed together by the canvas owner. */
export function editPromptMentions(id: string, edit: MentionEdit, nodes: AppNode[], edges: Edge[], sourceId?: MentionSources, edgeId = '') {
  const target = nodes.find(node => node.id === id);
  if (!target || isNodeLocked(target) || !(isCanvasTextNode(target) || isCanvasImageNode(target))) return;
  if (isCanvasImageNode(target) && edges.some(edge => edge.target === id && edge.targetHandle === 'prompt')) return;
  const mentions = validPromptMentions(edit.prompt, edit.mentions);
  const previous = isCanvasTextNode(target) ? target.data.textComposer.mentions : target.data.composer.mentions;
  const removed = new Set((previous ?? []).filter(old => !mentions.some(item => item.nodeId === old.nodeId)).map(item => item.nodeId));
  let nextEdges = edges.filter(edge => !(edge.target === id && edge.data?.mention && removed.has(edge.source)));
  const addedEdges: Edge[] = [];
  const sources = [...new Set(typeof sourceId === 'string' ? [sourceId] : sourceId ?? [])];
  for (const source of sources) {
    const candidate = mentionCandidates(id, nodes, nextEdges).find(item => item.id === source);
    if (!candidate || candidate.disabled) return;
    if (!candidate.connected) {
      const handle = imageInputHandles.find(handle => !nextEdges.some(edge => edge.target === id && edge.targetHandle === handle))!;
      const added: Edge = { id: addedEdges.length ? `${edgeId}-${addedEdges.length}` : edgeId, source, target: id, sourceHandle: 'result', targetHandle: handle, type: 'default', data: { mention: true } };
      addedEdges.push(added);
      nextEdges = [...nextEdges, added];
    }
  }
  // Deleting the last capsule removes only a wire originally created by @.
  // Wires manually connected before mentioning keep their independent lifetime.
  let nextNodes = nodes.map(node => {
    if (node.id !== id) return node;
    if (isCanvasTextNode(node)) return { ...node, data: { ...node.data, textComposer: { ...node.data.textComposer, prompt: edit.prompt, mentions } } };
    if (isCanvasImageNode(node)) return { ...node, data: { ...node.data, composer: { ...node.data.composer, prompt: edit.prompt, mentions } } };
    return node;
  });
  if (addedEdges.length) nextNodes = connectImageReferenceRatio(nextNodes, edges, nextEdges, id);
  return { nodes: nextNodes, edges: nextEdges, added: addedEdges[0], addedEdges };
}


/** Removing an input also removes its capsules, in the same undo snapshot. */
export function pruneDisconnectedMentions(nodes: AppNode[], removed: readonly Edge[]): AppNode[] {
  if (!removed.length) return nodes;
  return nodes.map(node => {
    const sources = new Set(removed.filter(edge => edge.target === node.id && isImageInputHandle(edge.targetHandle)).map(edge => edge.source));
    const composer = isCanvasTextNode(node) ? node.data.textComposer : isCanvasImageNode(node) ? node.data.composer : undefined;
    if (!composer || !composer.mentions?.some(item => sources.has(item.nodeId))) return node;
    let prompt = '', offset = 0;
    const mentions: PromptMention[] = [];
    for (const item of validPromptMentions(composer.prompt, composer.mentions)) {
      prompt += composer.prompt.slice(offset, item.from);
      if (!sources.has(item.nodeId)) {
        const from = prompt.length;
        prompt += composer.prompt.slice(item.from, item.to);
        mentions.push({ ...item, from, to: prompt.length });
      }
      offset = item.to;
    }
    prompt += composer.prompt.slice(offset);
    if (isCanvasTextNode(node)) return { ...node, data: { ...node.data, textComposer: { ...node.data.textComposer, prompt, mentions } } };
    if (isCanvasImageNode(node)) return { ...node, data: { ...node.data, composer: { ...node.data.composer, prompt, mentions } } };
    return node;
  });
}
