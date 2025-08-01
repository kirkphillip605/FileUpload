import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3020,
    host: true,
    allowedHosts: [
      'files.kirknetllc.com',
      '.kirknetllc.com',
      'localhost',
      '10.10.0.251'
    ],
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('🔴 Proxy error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🔄 Proxying:', req.method, req.url, '→', proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ Proxy response:', proxyRes.statusCode, 'for', req.url);
          });
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});