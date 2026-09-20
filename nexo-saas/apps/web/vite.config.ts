import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    envDir: process.cwd(),
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1', port: Number(process.env.WEB_PORT || 5173), strictPort: true,
      proxy: { '/api': { target: process.env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${env.API_PORT || 4000}`, changeOrigin: false } },
    },
    build: { outDir: '../../build/web', emptyOutDir: true },
  };
});
