import assert from 'node:assert/strict';
import test from 'node:test';
import { documentText, hasVariable, initialTextDocument, textToDocument } from './textDocument.ts';
import { resolveTextValue } from './textVariables.ts';
import type { AppNode } from './types';

test('plain text round trips empty lines and literal HTML without interpreting it', () => {
  for (const text of ['', '中文\n\n第二段\n', '<script>alert(1)</script>']) {
    assert.equal(documentText(textToDocument(text)), text);
  }
});

test('legacy text and connections become a single editable document', () => {
  const doc = initialTextDocument('正文', ['variable-1', 'variable-2'], 'target');
  assert.equal(documentText(doc, (handle) => handle === 'variable-1' ? '猫' : '摄影棚'), '猫 摄影棚 正文');
  assert.equal(hasVariable(doc, 'variable-2'), true);
  assert.equal(hasVariable(doc, 'variable-3'), false);
});

test('inline variables resolve in document order and update without storing source values', () => {
  const source: AppNode = { id: 'source', type: 'text', position: { x: 0, y: 0 }, data: { text: '猫' } };
  const target: AppNode = { id: 'target', type: 'text', position: { x: 0, y: 0 }, data: {
    text: '在摄影棚拍摄。', content: { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '在摄影棚拍摄' },
      { type: 'promptVariable', attrs: { handleId: 'variable-1', ownerId: 'target' } },
      { type: 'text', text: '。' },
    ] }] },
  } };
  const edges = [{ id: 'edge', source: 'source', target: 'target', targetHandle: 'variable-1' }];
  assert.equal(resolveTextValue('target', [source, target], edges), '在摄影棚拍摄猫。');
  source.data.text = '狗';
  assert.equal(resolveTextValue('target', [source, target], edges), '在摄影棚拍摄狗。');
  assert.equal(resolveTextValue('target', [source, target], []), '在摄影棚拍摄。');
  assert.equal(resolveTextValue('target', [target], edges), '在摄影棚拍摄。');
});

test('cycles terminate and empty documents do not emit suggestion text', () => {
  const nodes: AppNode[] = ['a', 'b'].map((id) => ({ id, type: 'text', position: { x: 0, y: 0 },
    data: { text: '', content: initialTextDocument('', ['variable-1'], id) } }));
  assert.equal(resolveTextValue('a', nodes, [
    { id: 'ab', source: 'a', target: 'b', targetHandle: 'variable-1' },
    { id: 'ba', source: 'b', target: 'a', targetHandle: 'variable-1' },
  ]).trim(), '');
  assert.equal(documentText(textToDocument('')), '');
});
