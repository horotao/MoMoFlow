import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset } from './types';
import { isSeedreamNode, isNodeLocked } from './types.ts';
import { seedreamMaxImages, seedreamModel, validateSeedreamSettings } from './seedream.ts';
import { imageOutput } from './sunburstRun.ts';
import { resolveTextValue } from './textVariables.ts';
import { annotationMarkup } from './interactiveEdit.ts';
import { pinnedResultInput, sameAnnotationImage } from './annotationGraph.ts';
import type { PreviewTask } from './taskQueue';

function collectAnnotationPrompt(id: string, nodes: AppNode[], edges: Edge[]) {
  const originals: FileAsset[] = [];
  const marks: { group: number; coordinates: string }[] = [];
  const token = '⟦' + crypto.randomUUID() + ':';
  const prompt = resolveTextValue(id, nodes, edges, undefined, ({ image, mark }) => {
    let group = originals.findIndex(original => sameAnnotationImage(original, image));
    if (group < 0) group = originals.push(image) - 1;
    marks.push({ group, coordinates: annotationMarkup(mark) });
    return token + (marks.length - 1) + '⟧';
  });
  return { originals, marks, prompt, marker: new RegExp(token + '(\\d+)⟧', 'g') };
}

export function hasSplitSeedreamPrompt(id: string, nodes: AppNode[], edges: Edge[]) {
  return collectAnnotationPrompt(id, nodes, edges).originals.length > 1;
}

function splitAnnotationPrompt({ originals, marks, prompt, marker }: ReturnType<typeof collectAnnotationPrompt>) {
  const groupOf = (match: RegExpMatchArray) => marks[Number(match[1])].group;
  const parts: { text: string; groups?: Set<number> }[] = [];
  const listSeparator = /^\s*(?:和|与|及|以及|、|，|,|and|or)?\s*$/i;
  const after = (match: RegExpMatchArray) => match.index! + match[0].length;
  for (const paragraph of prompt.split(/\r?\n/)) {
    // Separate unmarked paragraphs are shared; follow-up text within an
    // annotated paragraph stays with the most recent instruction.
    let scope: Set<number> | undefined;
    for (const sentence of paragraph.split(/(?<=[。！？；!?;])|(?<=\.)[ \t]+/)) {
      const matches = [...sentence.matchAll(marker)];
      const groups = new Set(matches.map(groupOf));
      if (groups.size <= 1) {
        if (groups.size) scope = groups;
        parts.push({ text: sentence, groups: scope });
        continue;
      }

      if (matches.slice(1).every((match, index) => listSeparator.test(sentence.slice(after(matches[index]), match.index)))) {
        const prefix = sentence.slice(0, matches[0].index);
        const suffix = sentence.slice(after(matches[matches.length - 1]));
        for (const group of groups) {
          const selected = matches.filter(match => groupOf(match) === group);
          parts.push({ text: prefix + selected.map(match => match[0]).join('、') + suffix, groups: new Set([group]) });
        }
        scope = groups;
        continue;
      }

      let previous: typeof parts[number] | undefined;
      for (const clause of sentence.split(/(?<=[，,])|(?=(?:然后|并且|以及|和|再|并)\s*(?:把|将|让))/)) {
        const clauseGroups = new Set([...clause.matchAll(marker)].map(groupOf));
        if (clauseGroups.size > 1) throw new Error('请用逗号、句号或换行分开不同原图的标注指令。');
        if (!clauseGroups.size && previous) {
          previous.text += clause;
        } else {
          if (clauseGroups.size) scope = clauseGroups;
          previous = { text: clause, groups: scope };
          parts.push(previous);
        }
      }
    }
  }
  return originals.map((image, index) => ({
    images: [image.url],
    prompt: parts.filter(part => !part.groups || part.groups.has(index))
      .map(part => part.text.replace(marker, (_, mark: string) => marks[Number(mark)].coordinates)
        .trim().replace(/^[，,]|[，,]$/g, '').replace(/^(?:然后|并且|以及|和|再|并)(?=\s*(?:把|将|让))/, '').trim())
      .filter(Boolean).join('\n'),
    seedreamGroup: { imageId: image.id, index, total: originals.length },
  }));
}

function singleSeedreamPrompt(annotation: ReturnType<typeof collectAnnotationPrompt>, inputs: Edge[], imageInputs: number, nodes: AppNode[], edges: Edge[], promptId?: string) {
  const references = inputs.filter(edge => /^image-\d+$/.test(edge.targetHandle ?? ''))
    .sort((a, b) => Number(a.targetHandle?.slice(6)) - Number(b.targetHandle?.slice(6)))
    .flatMap(edge => {
      if (Number(edge.targetHandle?.slice(6)) >= imageInputs) throw new Error('参考图端口不存在。');
      const input = pinnedResultInput(edge, promptId, nodes, edges) ?? edge;
      const assets = imageOutput(nodes.find(item => item.id === input.source), input.sourceHandle);
      if (!assets.length) throw new Error('连接的 Image 尚无图片，上游未提供可用输出。');
      return assets;
    });
  const original = annotation.originals[0];
  let referenceIndex = original ? references.findIndex(asset => sameAnnotationImage(asset, original)) : -1;
  if (original && referenceIndex < 0) referenceIndex = references.push(original) - 1;
  if (references.length > seedreamMaxImages) throw new Error(`最多支持 ${seedreamMaxImages} 张参考图片。`);
  return {
    prompt: annotation.prompt.replace(annotation.marker, (_, mark: string) => {
      const { coordinates } = annotation.marks[Number(mark)];
      return references.length > 1 ? `图${referenceIndex + 1} ${coordinates}` : coordinates;
    }).trim(),
    images: references.map(asset => asset.url),
    seedreamGroup: undefined,
  };
}

export function prepareSeedreamRun(nodes: AppNode[], edges: Edge[], ids: string[], runs: number, inlinePrompt?: string): { tasks: PreviewTask[]; error?: string } {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) return { tasks: [], error: '运行次数必须为 1–10。' };
  const tasks: PreviewTask[] = [], batchId = crypto.randomUUID(), createdAt = Date.now();
  try {
    for (const id of new Set(ids)) {
      const node = nodes.find(item => item.id === id);
      if (!node || !isSeedreamNode(node) || isNodeLocked(node)) continue;
      const settings = validateSeedreamSettings({ ...node.data, size: node.data.size ?? 'auto' });
      const inputs = edges.filter(edge => edge.target === id);
      const promptEdge = inputs.find(edge => edge.targetHandle === 'prompt');
      const annotation = promptEdge ? collectAnnotationPrompt(promptEdge.source, nodes, edges)
        : { prompt: inlinePrompt ?? '', originals: [], marks: [], marker: /(?!)/g };
      const groups = annotation.originals.length > 1
        ? splitAnnotationPrompt(annotation)
        : [singleSeedreamPrompt(annotation, inputs, node.data.imageInputs, nodes, edges, promptEdge?.source)];
      for (const { prompt } of groups) {
        if (!prompt || prompt.length > 32000) throw new Error('请为 Seedream 连接非空提示词，最多 32000 个字符。');
      }
      for (let index = 0; index < runs; index++) for (const { prompt, images, seedreamGroup } of groups) tasks.push({
        id: crypto.randomUUID(), batchId, createdAt, nodeId: id, model: seedreamModel, seedreamGroup,
        seedreamRequest: { ...settings, prompt, images: [...images] }, progress: 0, state: 'Queued', started: 0,
      });
    }
    return { tasks };
  } catch (error) { return { tasks: [], error: error instanceof Error ? error.message : '输入参数无效。' }; }
}
