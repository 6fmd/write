import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// When deploying to a custom domain (write.6f.md), base should be '/'.
// If deploying to a GH Pages repo subdirectory instead, set base to '/<repo-name>/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})
