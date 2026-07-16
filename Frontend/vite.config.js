import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Mol* is a large library (~3MB); raise the warning limit
    chunkSizeWarningLimit: 3500,
  },
})
