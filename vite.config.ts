import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { kongProxyMiddleware } from './tools/kongProxy'

// Local-only: lets the app reach a Kong Admin API without CORS by forwarding through this
// dev server. Enabled only by `npm run dev:proxy` (mode "proxy"), never in tests or builds.
function kongProxy(): Plugin {
  return {
    name: 'kong-proxy',
    configureServer(server) {
      server.middlewares.use(kongProxyMiddleware)
    },
  }
}

export default defineConfig(({ mode }) => ({
  base: '/kong-manager/',
  plugins: [vue(), ...(mode === 'proxy' ? [kongProxy()] : [])],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
}))
