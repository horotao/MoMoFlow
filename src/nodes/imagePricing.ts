import { validateSunburstSize, type SunburstSettings } from './sunburst.ts';

// OpenAI GPT Image 2.6 output calculator, checked 2026-11-24.
// https://developers.openai.com/api/docs/guides/image-generation#calculating-costs
const qualityGrid = {
  low: [16, 4.2], medium: [24, 3.3], high: [48, 1], xhigh: [64, 1], max: [96, 1],
} as const;

export function estimateImageCost(settings: Pick<SunburstSettings, 'quality' | 'size' | 'outputFormat'>,
  prompt: string, referenceCount: number, quantity: number) {
  if (!['png', 'jpeg', 'webp'].includes(settings.outputFormat) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
  const [longGrid, multiplier] = qualityGrid[settings.quality === 'auto' ? 'medium' : settings.quality] ?? [];
  if (!longGrid) return;
  const size = settings.size === 'auto' ? '1024x1024' : settings.size;
  try { validateSunburstSize(size); } catch { return; }
  const [width, height] = size.split('x').map(Number);
  const shortGrid = longGrid / (Math.max(width, height) / Math.min(width, height));
  const floor = Math.floor(shortGrid);
  // The calculator rounds exact half-grid ties to the nearest even integer.
  const rounded = shortGrid - floor === 0.5 ? floor + floor % 2 : Math.round(shortGrid);
  const base = Math.ceil(longGrid * rounded * (2_000_000 + width * height) / 4_000_000);
  const outputTokens = Math.round(base * multiplier);
  return quantity * (estimatedPromptTokens(prompt) * 5 + referenceCount * 1536 * 8 + outputTokens * 30) / 1_000_000;
}

function estimatedPromptTokens(prompt: string) {
  const wide = (prompt.match(/[^\p{ASCII}]/gu) ?? []).length;
  return Math.ceil((prompt.length - wide) / 4 + wide);
}

// Published APIMart standard-channel output tokens, 2026-11-24.
// https://apimart.ai/zh/model/gpt-image-2-6-sunburst
const apimartQualityIndex = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4, auto: 4 } as const;
const apimartOutputTokens: Record<string, readonly [number, number, number, number, number]> = {
  '1536x1536': [1172, 2073, 2511, 4464, 10044],
  '1536x2048': [1038, 1835, 2223, 3952, 8892],
  '16:9': [504, 924, 1078, 1917, 4312],
  '16:9@2k': [660, 1212, 1413, 2511, 5650],
  '16:9@4k': [1559, 2855, 3336, 5930, 13342],
  '1:1': [824, 1449, 1756, 3122, 7024],
  '1:1@2k': [1668, 2944, 3568, 6343, 14272],
  '1:1@4k': [2768, 4894, 5930, 10542, 23719],
  '1:2': [555, 974, 1180, 2098, 4720],
  '1:2@2k': [756, 1337, 1617, 2874, 6466],
  '1:2@4k': [1260, 2228, 2700, 4799, 10798],
  '1:3': [236, 443, 535, 937, 2140],
  '1:3@2k': [433, 816, 988, 1729, 3952],
  '1:3@4k': [584, 1096, 1328, 2324, 5311],
  '2048x1024': [555, 974, 1180, 2098, 4720],
  '2048x1536': [1038, 1835, 2223, 3952, 8892],
  '2048x2048': [1668, 2944, 3568, 6343, 14272],
  '2048x2304': [1584, 2796, 3467, 6128, 13706],
  '21:9': [441, 743, 943, 1617, 3682],
  '21:9@2k': [601, 1010, 1285, 2202, 5016],
  '21:9@4k': [983, 1650, 2099, 3598, 8196],
  '2304x1536': [1025, 1756, 2127, 3811, 8508],
  '2304x2048': [1584, 2796, 3467, 6128, 13706],
  '2304x2304': [1966, 3475, 4210, 7484, 16839],
  '2:1': [555, 974, 1180, 2098, 4720],
  '2:1@2k': [756, 1337, 1617, 2874, 6466],
  '2:1@4k': [1260, 2228, 2700, 4799, 10798],
  '2:3': [664, 1132, 1372, 2459, 5488],
  '2:3@2k': [887, 1518, 1838, 3216, 7351],
  '2:3@4k': [1890, 3241, 3926, 6870, 15703],
  '3072x1536': [903, 1598, 1935, 3440, 7740],
  '3072x1728': [1109, 2027, 2368, 4210, 9472],
  '3072x2048': [1533, 2627, 3184, 5705, 12736],
  '3072x2304': [1832, 3238, 3922, 6972, 15687],
  '3:1': [236, 443, 535, 937, 2140],
  '3:1@2k': [433, 816, 988, 1729, 3952],
  '3:1@4k': [584, 1096, 1328, 2324, 5311],
  '3:2': [664, 1132, 1372, 2459, 5488],
  '3:2@2k': [887, 1518, 1838, 3216, 7351],
  '3:2@4k': [1890, 3241, 3926, 6870, 15703],
  '3:4': [563, 994, 1204, 2140, 4815],
  '3:4@2k': [1038, 1835, 2223, 3952, 8892],
  '3:4@4k': [2063, 3644, 4413, 7845, 17650],
  '4:3': [563, 994, 1204, 2140, 4815],
  '4:3@2k': [1038, 1835, 2223, 3952, 8892],
  '4:3@4k': [2063, 3644, 4413, 7845, 17650],
  '4:5': [727, 1248, 1510, 2702, 6119],
  '4:5@2k': [1584, 2726, 3303, 5911, 13385],
  '4:5@4k': [2247, 3871, 4690, 8393, 19006],
  '5:4': [727, 1248, 1510, 2702, 6119],
  '5:4@2k': [1584, 2726, 3303, 5911, 13385],
  '5:4@4k': [2247, 3871, 4690, 8393, 19006],
  '9:16': [504, 924, 1078, 1917, 4312],
  '9:16@2k': [660, 1212, 1413, 2511, 5650],
  '9:16@4k': [1559, 2855, 3336, 5930, 13342],
  '9:21': [441, 743, 943, 1617, 3682],
  '9:21@2k': [601, 1010, 1285, 2202, 5016],
  '9:21@4k': [983, 1650, 2099, 3598, 8196],
};

export function estimateApimartImageCredits(settings: SunburstSettings, prompt: string, referenceCount: number, quantity: number) {
  if (!['png', 'jpeg', 'webp'].includes(settings.outputFormat) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
  const size = settings.size === 'auto' ? '1:1' : settings.size;
  const resolution = settings.resolution ?? '1K';
  const spec = size.includes('x') || resolution === '1K' ? size : `${size}@${resolution.toLowerCase()}`;
  const tokens = apimartOutputTokens[spec]?.[apimartQualityIndex[settings.quality]];
  if (tokens === undefined) return;
  return quantity * (estimatedPromptTokens(prompt) * 40 + referenceCount * 1536 * 64 + tokens * 240) / 1_000_000;
}
