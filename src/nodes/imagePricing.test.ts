import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateApimartImageCredits, estimateImageCost } from './imagePricing.ts';
import { defaultSunburstSettings } from './sunburst.ts';

const settings = { ...defaultSunburstSettings, size: '1024x1024', quality: 'low' } as const;

test('GPT Image 2.6 matches the official calculator and prices inputs for each image', () => {
  assert.equal(estimateImageCost(settings, '', 0, 1), 0.02469);
  assert.equal(estimateImageCost(settings, 'test画', 1, 3), (24690 + 10 + 12288) * 3 / 1e6);
  assert.equal(estimateImageCost({ ...settings, size: '2048x2048', quality: 'xhigh' }, '', 0, 1), 0.19029);
});

test('automatic settings use the displayed assumptions and SVG keeps usage-based pricing', () => {
  assert.equal(estimateImageCost({ ...settings, quality: 'auto', size: 'auto' }, '', 0, 1),
    estimateImageCost({ ...settings, quality: 'medium' }, '', 0, 1));
  assert.equal(estimateImageCost({ ...settings, outputFormat: 'svg' }, '', 0, 1), undefined);
});

test('APIMart standard uses published gold credits for the selected specification and batch', () => {
  const square = { ...settings, size: '1:1' };
  assert.equal(estimateApimartImageCredits(square, '', 0, 1), 0.19776);
  assert.equal(estimateApimartImageCredits({ ...square, resolution: '2K', quality: 'xhigh' }, 'test', 1, 2),
    2 * (40 + 1536 * 64 + 6343 * 240) / 1e6);
  assert.equal(estimateApimartImageCredits({ ...square, size: 'auto', resolution: '4K', quality: 'auto' }, '', 0, 1),
    23719 * 240 / 1e6);
  assert.equal(estimateApimartImageCredits({ ...square, size: '2048x2048', quality: 'xhigh' }, '', 0, 1), 1.52232);
  assert.equal(estimateApimartImageCredits({ ...square, outputFormat: 'gif' }, '', 0, 1), undefined);
});
