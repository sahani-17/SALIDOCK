import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Mol* is a large library (~3MB); raise the warning limit
    chunkSizeWarningLimit: 3500,
  },
  server: {
    // Proxy /api and /health to the local backend during `npm run dev`.
    // This mirrors the Caddy reverse-proxy rules so the same relative
    // VITE_API_BASE_URL (empty) works in both dev and Docker.
    proxy: {
      '/api': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
