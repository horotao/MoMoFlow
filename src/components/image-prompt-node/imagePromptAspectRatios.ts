export const imagePromptAspectRatioGroups = [
  { label: '自动', values: ['auto'] },
  { label: '正方形', values: ['1:1'] },
  { label: '横向', values: ['21:9', '16:9', '4:3', '3:2'] },
  { label: '纵向', values: ['2:3', '3:4', '9:16'] },
] as const;

export type ImagePromptAspectRatio = typeof imagePromptAspectRatioGroups[number]['values'][number];

// The compact generation-options list follows the reference's display order.
export const imagePromptGenerationAspectRatios = ['auto', '21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'] as const;
