export { default } from '../server/vercelHandler.ts';

// Existing handlers consume the raw request stream.
export const config = { api: { bodyParser: false } };
