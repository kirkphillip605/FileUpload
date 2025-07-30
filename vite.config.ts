import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3010,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3011',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
