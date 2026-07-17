import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.PUENTE_API_TARGET ?? 'http://localhost:5006';

// puente is designed to be exposed on your own domains — including its own panel,
// e.g. through a Cloudflare Tunnel. Vite's dev/preview server blocks requests whose
// Host header isn't in an allowlist (DNS-rebinding protection), which surfaces as:
//   "Blocked request. This host (…) is not allowed."
// Allow any host by default so tunneling the dev server just works. Set
// PUENTE_ALLOWED_HOSTS=a.example.com,b.example.com to restrict it instead.
// (This only affects `vite` dev/preview — production is served by the NestJS
// server, which has no Host restriction.)
const ALLOWED_HOSTS: true | string[] = process.env.PUENTE_ALLOWED_HOSTS
  ? process.env.PUENTE_ALLOWED_HOSTS.split(',')
      .map((h) => h.trim())
      .filter(Boolean)
  : true;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    allowedHosts: ALLOWED_HOSTS,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: false },
    },
  },
  preview: {
    allowedHosts: ALLOWED_HOSTS,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
