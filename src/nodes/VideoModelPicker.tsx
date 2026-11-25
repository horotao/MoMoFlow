import { useState } from 'react';
import { MediaModelPicker } from './MediaModelPicker';
import { videoModelDisplay, videoModels } from './videoComposer';
import type { VideoComposer } from './types';

export function VideoModelPicker({ composer, disabled, appearance, onEdit }: {
  composer: VideoComposer; disabled: boolean; appearance: 'toolbar' | 'inspector';
  onEdit: (change: Partial<VideoComposer>) => void;
}) {
  const [pinned, setPinned] = useState<VideoComposer['model'][]>([]);
  const { label, brand, selection } = videoModelDisplay(composer);
  return <MediaModelPicker label="选择视频模型" name={label} brand={brand} models={videoModels} singleSelection
    selection={selection} pinned={pinned} onPinnedChange={setPinned} appearance={appearance} disabled={disabled}
    onChange={value => onEdit({ model: value.modelIds[0], selection: value })} />;
}
