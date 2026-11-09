export const modelTimeoutCode = 'MODEL_TIMEOUT';

export class ModelRequestTimeout extends Error {}

export const isTimeoutStatus = (status?: number) => status === 408 || status === 504;

export function modelRequestError(message: string, status: number, code?: unknown) {
  return code === modelTimeoutCode || isTimeoutStatus(status) ? new ModelRequestTimeout(message) : new Error(message);
}
