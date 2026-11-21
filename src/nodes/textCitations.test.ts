import test from 'node:test';
import assert from 'node:assert/strict';
import { textCitations, textCitationParts, textWithCitations } from './textCitations.ts';

test('Text citations reject unsafe URLs, overlapping or invalid offsets while preserving source order', () => {
  const text = '正文😀[一]，另一个事实[二]。';
  const one = { url: 'https://openai.com/', title: '官方', startIndex: text.indexOf('[一]'), endIndex: text.indexOf('[一]') + 3 };
  const two = { url: 'https://example.com/', title: '参考', startIndex: text.indexOf('[二]'), endIndex: text.indexOf('[二]') + 3 };
  assert.deepEqual(textCitations([two, one, one, { ...one, url: 'javascript:alert(1)' }, { ...one, url: 'data:text/html,bad' },
    { ...one, url: 'https://user:secret@example.com' }, { ...one, startIndex: -1 }, { ...one, endIndex: 999 }, { ...one, startIndex: 1.5 }], text), [one, two]);
  assert.equal(textWithCitations(text, [one, two]), '正文😀[[1]](<https://openai.com/>)，另一个事实[[2]](<https://example.com/>)。');
  assert.deepEqual(textCitationParts(text).map(part => part.text), [text]);
  assert.equal(textCitations(null, text).length, 0);
});
