import { defineConfig, loadEnv } from 'vite';
import { deepseekPlugin } from './server/deepseek';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), deepseekPlugin(loadEnv(mode, process.cwd(), 'DEEPSEEK_').DEEPSEEK_API_KEY ?? '')],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
}));
