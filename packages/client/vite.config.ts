import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // so a phone on the same wifi can open it
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:8787', ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    // Mobile-first: keep the initial payload small enough for a 3G handshake.
    chunkSizeWarningLimit: 400,
  },
});
