import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePromptClipboard, encodePromptClipboard, promptClipboardHtml } from './promptMentionClipboard.ts';

test('clipboard preserves mixed Unicode text, line breaks, and repeated image references', () => {
  const edit = { prompt: '参考 图一\n图一 / <image>', mentions: [{ nodeId: 'image-id', from: 3, to: 5 }, { nodeId: 'image-id', from: 6, to: 8 }] };
  assert.deepEqual(decodePromptClipboard(encodePromptClipboard(edit), edit.prompt), edit);
  assert.equal(decodePromptClipboard(encodePromptClipboard(edit), 'unrelated clipboard text'), undefined);
});
test('malformed clipboard metadata cannot create partial or overlapping capsules', () => {
  for (const mentions of [[null], [{ nodeId: 4, from: 0, to: 1 }], [{ nodeId: 'a', from: 0, to: 9 }], [{ nodeId: 'a', from: 0, to: 2 }, { nodeId: 'b', from: 1, to: 3 }]]) {
    assert.equal(decodePromptClipboard(JSON.stringify({ version: 1, prompt: 'abc', mentions }), 'abc'), undefined);
  }
  assert.equal(decodePromptClipboard('{broken', 'abc'), undefined);
});
test('HTML fallback escapes source names and metadata instead of executing pasted markup', () => {
  const prompt = '<img src=x onerror="alert(1)"> & 中文';
  const html = promptClipboardHtml({ prompt, mentions: [{ nodeId: '"<source>', from: 0, to: prompt.length }] });
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-momoflow-prompt="{&quot;'));
});
