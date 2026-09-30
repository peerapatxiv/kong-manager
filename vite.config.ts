import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { kongProxyMiddleware } from './tools/kongProxy'

// Local-only: lets the app reach a Kong Admin API without CORS by forwarding through the
// local server. Enabled only in mode "proxy" (`npm start`, `npm run dev:proxy`), never in
// tests or the hosted build.
function kongProxy(): Plugin {
  return {
    name: 'kong-proxy',
    configureServer(server) {
      server.middlewares.use(kongProxyMiddleware)
    },
    configurePreviewServer(server) {
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
