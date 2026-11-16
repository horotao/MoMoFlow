import { defineConfig, loadEnv } from 'vite';
import { sunburstPlugin } from './server/sunburst';
import { deepseekPlugin } from './server/deepseek';
import { apiSettingsPlugin } from './server/apiSettings';
import { apimartPlugin } from './server/apimart';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [apimartPlugin(loadEnv(mode, process.cwd(), 'APIMART_').APIMART_API_KEY ?? ''), apiSettingsPlugin({
    openai: loadEnv(mode, process.cwd(), 'OPENAI_').OPENAI_API_KEY ?? '',
    apimart: loadEnv(mode, process.cwd(), 'APIMART_').APIMART_API_KEY ?? '',
    deepseek: loadEnv(mode, process.cwd(), 'DEEPSEEK_').DEEPSEEK_API_KEY ?? '',
  }), react(), tailwindcss(), deepseekPlugin(loadEnv(mode, process.cwd(), 'DEEPSEEK_').DEEPSEEK_API_KEY ?? ''), sunburstPlugin(loadEnv(mode, process.cwd(), 'OPENAI_').OPENAI_API_KEY ?? '')],
  worker: { format: 'es' },
  optimizeDeps: { include: ['@huggingface/transformers'] },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
}));
