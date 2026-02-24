import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Mol* is a large library (~3MB); raise the warning limit
    chunkSizeWarningLimit: 3500,
  },
})
