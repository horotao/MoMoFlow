// Use the screen-space sidebar control; keep execution assertions in each fixture.
export function changeModelRuns(delta: number) {
  const input = document.querySelector<HTMLInputElement>('.settings-run-count input[type="number"], .node-batch-run input[type="number"]');
  if (!input) throw new Error('Model run count input must be visible');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(Number(input.value) + delta));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
