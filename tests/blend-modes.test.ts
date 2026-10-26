import { blendModes } from '../src/nodes/blend';
import { BlendRenderer } from '../src/nodes/blendRender';

const width = 144, height = 144, frameSize = width * height * 4;
const opacities = [0, .01, .25, .5, .63, 1];
const status = document.querySelector('#status')!;
const tolerance = { meanPremultiplied: .12, maxPremultiplied: 6.01, alpha: 1 };
function read(bitmap: ImageBitmap) {
  // A fresh software readback for EVERY image avoids Chrome switching between
  // GPU and CPU rounding paths halfway through a comparison.
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true, colorType: 'float16' } as const)!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, width, height).data;
}
function compare(actual: Uint8ClampedArray, expected: Uint8ClampedArray) {
  let sum = 0, maxPremultiplied = 0, maxAlpha = 0;
  let worst: unknown;
  for (let i = 0; i < frameSize; i += 4) {
    maxAlpha = Math.max(maxAlpha, Math.abs(actual[i + 3] - expected[i + 3]));
    for (let c = 0; c < 3; c++) {
      const error = Math.abs(actual[i + c] * actual[i + 3] - expected[i + c] * expected[i + 3]) / 255;
      sum += error;
      if (error > maxPremultiplied) {
        maxPremultiplied = error;
        worst = { pixel: i / 4, actual: [...actual.slice(i, i + 4)], expected: [...expected.slice(i, i + 4)] };
      }
    }
  }
  return { meanPremultiplied: sum / (width * height * 3), maxPremultiplied, maxAlpha, worst };
}
async function run() {
  const compressed = await fetch('./fixtures/blend-weavy.rgba.bin');
  if (!compressed.ok || !compressed.body) throw new Error('Missing Weavy fixture');
  const golden = new Uint8ClampedArray(await new Response(compressed.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if (golden.length !== frameSize * 110) throw new Error('Invalid Weavy fixture size');
  const source = async (name: string) => {
    const image = new Image();
    image.src = `./fixtures/${name}-alpha.png`;
    await image.decode();
    return createImageBitmap(image, { premultiplyAlpha: 'none' });
  };
  const renderer = new BlendRenderer({ back: await source('back'), front: await source('front') });
  const rows = [];
  try {
    for (const [m, mode] of blendModes.entries()) {
      const cases = [];
      for (const [o, opacity] of opacities.entries()) {
        status.textContent = `${mode}: ${opacity * 100}%`;
        const frame = await renderer.render({ mode, opacity }, true);
        if (!frame?.blob || !frame.bitmap) throw new Error('Missing Worker PNG');
        const png = await createImageBitmap(frame.blob, { premultiplyAlpha: 'none' });
        const actual = read(png), preview = read(frame.bitmap);
        const index = 2 + m * opacities.length + o;
        const stats = compare(actual, golden.subarray(index * frameSize, (index + 1) * frameSize));
        const previewStats = compare(preview, actual);
        const passed = stats.meanPremultiplied <= tolerance.meanPremultiplied && stats.maxPremultiplied <= tolerance.maxPremultiplied && stats.maxAlpha <= tolerance.alpha && previewStats.maxPremultiplied <= 1 && previewStats.maxAlpha === 0;
        cases.push({ opacity, ...stats, previewStats, passed });
        png.close(); frame.bitmap.close();
      }
      rows.push({ mode, cases });
      const tr = document.createElement('tr');
      const values = [mode, width * height * opacities.length, Math.max(...cases.map(c => c.maxPremultiplied)).toFixed(3), Math.max(...cases.map(c => c.maxAlpha)), Math.max(...cases.map(c => c.meanPremultiplied)).toFixed(4), cases.every(c => c.passed) ? 'PASS' : 'FAIL'];
      for (const value of values) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }
      document.querySelector('#rows')!.append(tr);
    }
  } finally { renderer.dispose(); }
  const passed = rows.every(r => r.cases.every(c => c.passed));
  const report = { status: passed ? 'passed' : 'failed', reference: '108 actual Weavy RGBA PNG exports, 2026-10-26', comparedPixels: width * height * 108, tolerance, rows };
  document.querySelector('#report')!.textContent = JSON.stringify(report, null, 2);
  status.textContent = `${passed ? 'PASSED' : 'FAILED'}: 108 Worker / PNG comparisons against Weavy; ${report.comparedPixels.toLocaleString()} pixels.`;
  status.setAttribute('data-result', report.status);
}
void run().catch(error => { status.textContent = String(error); status.setAttribute('data-result', 'failed'); console.error(error); });
