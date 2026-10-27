import { ideogramPlugin } from './server/ideogram';
import { nanoBananaPlugin } from './server/nanoBanana';
import { defineConfig, loadEnv } from 'vite';
import { sunburstPlugin } from './server/sunburst';
import { deepseekPlugin } from './server/deepseek';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [ideogramPlugin(loadEnv(mode, process.cwd(), 'WAVESPEED_').WAVESPEED_API_KEY ?? ''), nanoBananaPlugin(loadEnv(mode, process.cwd(), 'ZENMUX_').ZENMUX_API_KEY ?? ''), react(), tailwindcss(), deepseekPlugin(loadEnv(mode, process.cwd(), 'DEEPSEEK_').DEEPSEEK_API_KEY ?? ''), sunburstPlugin(loadEnv(mode, process.cwd(), 'ZENMUX_').ZENMUX_API_KEY ?? '')],
  worker: { format: 'es' },
  optimizeDeps: { include: ['@huggingface/transformers'] },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
}));
