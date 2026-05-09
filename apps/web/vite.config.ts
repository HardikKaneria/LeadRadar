import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  css: {
    // Keep PostCSS local to this app so Vite doesn't walk into sibling-project
    // configs that still reference the deprecated Tailwind v3 plugin shape.
    postcss: {},
  },
  resolve: {
    alias: {
      '@leadradar/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  plugins: [react(), tailwindcss()],
})
