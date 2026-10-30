import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { kongProxyMiddleware } from './tools/kongProxy'
import { createTabTracker, heartbeatMiddleware, watchTabs } from './tools/autoStop'

// Local-only: lets the app reach a Kong Admin API without CORS by forwarding through the
// local server. Enabled only in mode "proxy" (`npm start`, `npm run dev:proxy`), never in
// tests or the hosted build.
function kongProxy(): Plugin {
  // The macOS app sets KONG_MANAGER_AUTO_STOP=1 so the server stops once every tab is closed.
  // Without it the tabs still check in, but nothing acts on it.
  const tracker = createTabTracker()
  const heartbeat = heartbeatMiddleware(tracker)
  return {
    name: 'kong-proxy',
    configureServer(server) {
      server.middlewares.use(heartbeat)
      server.middlewares.use(kongProxyMiddleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(heartbeat)
      server.middlewares.use(kongProxyMiddleware)
      if (process.env.KONG_MANAGER_AUTO_STOP === '1') {
        watchTabs(tracker, () => {
          console.log('All Kong Manager tabs are closed. Stopping the server.')
          process.exit(0)
        })
      }
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
