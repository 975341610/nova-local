/// <reference types="vitest" />

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    // v0.21.8 · 代码分割瘦身: 把 tiptap / shiki / katex 拆成独立 chunk,
    // 主包从 2.22 MB 降至目标 <1.5 MB.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-tiptap'
            if (id.includes('shiki')) return 'vendor-shiki'
            if (id.includes('katex')) return 'vendor-katex'
            if (id.includes('fflate') || id.includes('pako')) return 'vendor-compress'
            if (id.includes('react-dom')) return 'vendor-react'
            if (id.includes('react')) return 'vendor-react'
          }
          return undefined
        },
      },
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/frontend_dist/**',
      '**/.git/**',
      '**/.qingzhi-*/**',
      '**/.qingzhi_*/**',
    ],
  },
})
