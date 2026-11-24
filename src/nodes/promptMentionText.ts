import type { PromptMention } from './types.ts';

export function validPromptMentions(prompt: string, mentions: readonly PromptMention[] = []) {
  let end = 0;
  return mentions.filter(mention => {
    if (!Number.isInteger(mention.from) || !Number.isInteger(mention.to) || mention.from < end || mention.to <= mention.from || mention.to > prompt.length || !mention.nodeId) return false;
    end = mention.to;
    return true;
  });
}

export interface MentionImageInput { nodeId: string; url: string }
/** Use the final model image array, including manual references and reordered inputs. */
export function numberedMentionPrompt(prompt: string, mentions: readonly PromptMention[] | undefined, inputs: readonly MentionImageInput[], images: readonly string[],
  formatReference = (position: number) => `image ${position}`) {
  const sameOrder = inputs.length === images.length && inputs.every((input, index) => input.url === images[index]);
  let result = '', offset = 0;
  for (const mention of validPromptMentions(prompt, mentions)) {
    const source = inputs.findIndex(input => input.nodeId === mention.nodeId);
    const index = source < 0 ? -1 : sameOrder ? source : images.indexOf(inputs[source].url);
    if (index < 0) throw new Error('引用图片未包含在当前模型输入中，请重新连接或 @ 选择图片。');
    result += prompt.slice(offset, mention.from) + formatReference(index + 1);
    offset = mention.to;
  }
  return result + prompt.slice(offset);
}
