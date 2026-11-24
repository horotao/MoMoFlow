import { defineConfig, loadEnv } from 'vite';
import { sunburstPlugin } from './server/sunburst';
import { textPlugin } from './server/text';
import { apiSettingsPlugin } from './server/apiSettings';
import { apimartPlugin } from './server/apimart';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const keys = {
    openai: loadEnv(mode, process.cwd(), 'OPENAI_').OPENAI_API_KEY ?? '',
    apimart: loadEnv(mode, process.cwd(), 'APIMART_').APIMART_API_KEY ?? '',
    deepseek: loadEnv(mode, process.cwd(), 'DEEPSEEK_').DEEPSEEK_API_KEY ?? '',
  };
  return {
    plugins: [textPlugin(keys), apimartPlugin(keys.apimart), apiSettingsPlugin(keys), react(), tailwindcss(), sunburstPlugin(keys.openai)],
    worker: { format: 'es' },
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  };
});
