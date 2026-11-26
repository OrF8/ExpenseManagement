import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import exceljsBrowser from './scripts/exceljsBrowser.js'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    exceljsBrowser(),
  ],
  build: {
    chunkSizeWarningLimit: 800,
  },
})
