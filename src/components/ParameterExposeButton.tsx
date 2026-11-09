export function ParameterExposeButton({ label, exposed, disabled, onClick, ariaLabel, title }: {
  label: string; exposed: boolean; disabled?: boolean; onClick: () => void; ariaLabel?: string; title?: string;
}) {
  return <button type="button" disabled={disabled} className="describer-expose" data-exposed={exposed}
    title={title ?? (exposed ? '使用本地值' : '设为输入')}
    aria-label={ariaLabel ?? (exposed ? `${label}使用本地值` : `将${label}设为输入`)}
    aria-pressed={exposed} onClick={onClick}><img src="/gpt-sidebar/expose.svg" width={20} height={20} alt="" /></button>;
}
