import test from 'node:test';
import assert from 'node:assert/strict';
import { imageCreatedAt, imageDateLabel, imageFormat, imageModel, imageSizeLabel } from './imageMetadata.ts';
import type { FileAsset } from './types';

const image: FileAsset = { id: 'image', name: 'original.png', url: 'blob:image', kind: 'image' };
const recorded = (model: string): FileAsset => ({ ...image, generation: {
  version: 1, outputSignature: image.id, inputSignature: JSON.stringify(['model-input-v1', model, { prompt: 'a strawberry' }]),
} });

test('metadata uses MIME before a renamed extension and preserves missing values', () => {
  assert.equal(imageFormat({ ...image, mimeType: 'image/jpeg' }), 'JPEG');
  assert.equal(imageFormat({ ...image, name: 'vector.svg' }), 'SVG');
  assert.equal(imageFormat({ ...image, name: 'unnamed' }), undefined);
  assert.equal(imageCreatedAt(image), undefined);
  assert.equal(imageDateLabel(), '—');
  assert.equal(imageSizeLabel(), '—');
  assert.equal(imageSizeLabel(-1), '—');
  assert.equal(imageSizeLabel(1500000), '1.5 MB');
  assert.equal(imageSizeLabel(0), '0 B');
});

test('each history image retains its recorded model, with no fallback to current node settings', () => {
  assert.equal(imageModel(recorded('gpt-image-2.6-sunburst')), 'GPT Image 2.6 Sunburst');
  assert.equal(imageModel(recorded('gemini-nano-banana-2.1')), 'Nano Banana 2.1');
  assert.equal(imageModel(recorded('seedream-5-5')), 'Seedream 5.5');
  const mismatch = recorded('seedream-5-5'); mismatch.id = 'other';
  assert.equal(imageModel(mismatch), undefined);
  assert.equal(imageModel({ ...image, generation: { version: 1, outputSignature: image.id, inputSignature: '{broken' } }), undefined);
});

test('creation time survives renaming; legacy completion filenames remain readable without inventing import dates', () => {
  const createdAt = new Date(2026, 10, 21, 15, 31).getTime();
  assert.equal(imageCreatedAt({ ...image, createdAt, name: 'renamed.jpg' }), createdAt);
  assert.equal(imageDateLabel(createdAt), '2026/11/21 15:31');
  assert.equal(imageCreatedAt({ ...image, name: `Sunburst-${createdAt}.png` }), createdAt);
  assert.equal(imageCreatedAt({ ...image, name: `upload-${createdAt}.png` }), undefined);
});
