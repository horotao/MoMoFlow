import './CanvasMediaPlaceholder.css';

export function CanvasMediaPlaceholder({ data }: { data: { label: string } }) {
  return <div className="media-placeholder-card" data-media="audio">
    <div className="media-placeholder-heading">
      <span className="media-placeholder-icon" aria-hidden="true" />
      <span>{data.label}</span>
    </div>
    <span className="media-placeholder-icon" aria-hidden="true" />
    <span>音频功能尚未开放</span>
  </div>;
}
