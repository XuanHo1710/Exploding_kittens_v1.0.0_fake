import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@eldoria/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/assets': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          vendor: ['react', 'react-dom', 'zustand', 'socket.io-client', 'zod'],
        },
      },
    },
  },
});
