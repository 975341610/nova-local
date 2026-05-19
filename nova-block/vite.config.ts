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
    // v0.24.x · 在受限沙箱环境下避免 fork worker 触发 EAGAIN
    // 通过环境变量 VITEST_SINGLE_THREAD=1 切换到单线程池
    ...(process.env.VITEST_SINGLE_THREAD
      ? {
          pool: 'threads' as const,
          // Vitest 4 已把 poolOptions 提升到顶层
          poolOptions: {
            threads: { singleThread: true },
          },
        }
      : {}),
  },
})
