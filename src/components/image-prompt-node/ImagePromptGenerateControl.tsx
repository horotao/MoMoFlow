import { ImagePromptIcon } from './ImagePromptIcon';

const maxQuantity = 20;

export function ImagePromptGenerateControl({
  quantity, onQuantityChange, canChangeQuantity, canSend, canExpand = canSend,
  sendLabel, onSend, sendType = 'button',
}: {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  canChangeQuantity: boolean;
  canSend: boolean;
  canExpand?: boolean;
  sendLabel: string;
  onSend?: () => void;
  sendType?: 'button' | 'submit';
}) {
  function setQuantity(value: number) {
    onQuantityChange(Math.max(1, Math.min(maxQuantity, Math.trunc(value) || 1)));
  }

  return <div className={`image-node-generate-group${quantity > 1 ? ' is-expanded' : ''}${canExpand ? '' : ' is-disabled'}`}>
    <div className="image-node-quantity">
      <button type="button" aria-label="Decrease quantity" disabled={!canChangeQuantity || quantity <= 1} onClick={() => setQuantity(quantity - 1)}><ImagePromptIcon name="minus" /></button>
      <input aria-label="Quantity" role="spinbutton" aria-valuemin={1} aria-valuemax={maxQuantity} aria-valuenow={quantity}
        inputMode="numeric" value={quantity} disabled={!canChangeQuantity}
        onChange={event => setQuantity(Number(event.currentTarget.value))}
        onKeyDown={event => { if (sendType === 'submit' && event.key === 'Enter') event.preventDefault(); }} />
      <button type="button" aria-label="Increase quantity" disabled={!canChangeQuantity || quantity >= maxQuantity} onClick={() => setQuantity(quantity + 1)}><ImagePromptIcon name="plus" /></button>
    </div>
    <button className="image-node-generate" type={sendType} aria-label={sendLabel} disabled={!canSend} onClick={onSend}><ImagePromptIcon name="generate" /></button>
  </div>;
}
