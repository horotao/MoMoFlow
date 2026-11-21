export const imagePromptAspectRatioGroups = [
  { label: '自动', values: ['auto'] },
  { label: '正方形', values: ['1:1'] },
  { label: '横向', values: ['3:1', '21:9', '2:1', '16:9', '3:2', '4:3', '5:4'] },
  { label: '纵向', values: ['4:5', '3:4', '2:3', '9:16', '1:2', '9:21', '1:3'] },
] as const;

export type ImagePromptAspectRatio = typeof imagePromptAspectRatioGroups[number]['values'][number];

export const imagePromptGenerationAspectRatios = imagePromptAspectRatioGroups.flatMap(group => [...group.values]);
