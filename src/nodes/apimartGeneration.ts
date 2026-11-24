export const apimartGenerationCompleted = 'momoflow-apimart-generation-completed';

export function notifyApimartGenerationCompleted() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(apimartGenerationCompleted));
}
