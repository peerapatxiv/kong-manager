// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveDashboard from './LiveDashboard.vue'
import { useConnectionStore } from '../../stores/connection'

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

const DATA: Record<string, unknown[]> = {
  '/services': [{ id: 's1', enabled: true }, { id: 's2', enabled: true }, { id: 's3', enabled: false }],
  '/routes': [
    { id: 'r1', protocols: ['https'] },
    { id: 'r2', protocols: ['https', 'http'] },
    { id: 'r3', protocols: ['grpc'] },
    { id: 'r4', protocols: ['https'] },
  ],
  '/consumers': [{ id: 'c1' }, { id: 'c2' }],
  '/plugins': [{ name: 'cors' }, { name: 'rate-limiting' }, { name: 'rate-limiting' }],
}

type Handler = (url: URL) => ReturnType<typeof json>

function stubKong(override: Handler = () => undefined as never) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      calls.push(url.pathname)
      const custom = override(url)
      if (custom) return custom
      if (url.pathname === '/status') {
        return json({ database: { reachable: true }, server: { total_requests: 12345, connections_active: 4 } })
      }
      return json({ data: DATA[url.pathname] ?? [], offset: null })
    }),
  )
  return calls
}

async function mountDashboard() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/live/services', '/live/routes', '/live/plugins', '/live/consumers'].map((path) => ({ path, component: { template: '<div/>' } })),
  })
  const wrapper = mount(LiveDashboard, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const tile = (wrapper: Awaited<ReturnType<typeof mountDashboard>>, id: string) => wrapper.find(`[data-testid="tile-${id}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  useConnectionStore().$patch({
    active: { baseUrl: 'http://kong:8001', name: 'Kong CE' },
    info: { version: '3.5.0', database: 'postgres' },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('LiveDashboard', () => {
  it('shows the count of services, routes, consumers and plugins', async () => {
    stubKong()
    const wrapper = await mountDashboard()

    expect(tile(wrapper, 'services').text()).toContain('3')
    expect(tile(wrapper, 'routes').text()).toContain('4')
    expect(tile(wrapper, 'consumers').text()).toContain('2')
    expect(tile(wrapper, 'plugins').text()).toContain('3')
  })

  it('links every tile to its live screen', async () => {
    stubKong()
    const wrapper = await mountDashboard()

    expect(tile(wrapper, 'services').attributes('href')).toBe('/live/services')
    expect(tile(wrapper, 'routes').attributes('href')).toBe('/live/routes')
    expect(tile(wrapper, 'consumers').attributes('href')).toBe('/live/consumers')
    expect(tile(wrapper, 'plugins').attributes('href')).toBe('/live/plugins')
  })

  it('splits services into enabled and disabled', async () => {
    stubKong()
    const text = (await mountDashboard()).find('[data-testid="card-services"]').text()

    expect(text).toContain('2 enabled')
    expect(text).toContain('1 disabled')
  })

  it('lists routes per protocol and the most used plugins', async () => {
    stubKong()
    const wrapper = await mountDashboard()

    const routes = wrapper.find('[data-testid="card-routes"]').text()
    expect(routes).toContain('https')
    expect(routes).toContain('3')
    expect(routes).toContain('grpc')
    const plugins = wrapper.find('[data-testid="card-plugins"]').text()
    expect(plugins.indexOf('rate-limiting')).toBeLessThan(plugins.indexOf('cors'))
  })

  it('shows the Kong version, database and live status of the node', async () => {
    stubKong()
    const text = (await mountDashboard()).find('[data-testid="card-node"]').text()

    expect(text).toContain('3.5.0')
    expect(text).toContain('postgres')
    expect(text).toContain('reachable')
    expect(text).toContain('12,345')
  })

  it('shows an error on the one tile that failed and keeps the rest', async () => {
    stubKong((url) => (url.pathname === '/plugins' ? json({ message: 'boom' }, 500) : (undefined as never)))
    const wrapper = await mountDashboard()

    expect(tile(wrapper, 'plugins').text()).toContain('boom')
    expect(tile(wrapper, 'services').text()).toContain('3')
  })

  it('leaves out the node card when /status is not available', async () => {
    stubKong((url) => (url.pathname === '/status' ? json({ message: 'no' }, 403) : (undefined as never)))
    const wrapper = await mountDashboard()

    expect(wrapper.find('[data-testid="card-node"]').exists()).toBe(false)
    expect(tile(wrapper, 'routes').text()).toContain('4')
  })

  it('says so when there is nothing to break down yet', async () => {
    stubKong((url) => (['/routes', '/plugins', '/services'].includes(url.pathname) ? json({ data: [], offset: null }) : (undefined as never)))
    const wrapper = await mountDashboard()

    expect(wrapper.find('[data-testid="card-routes"]').text()).toContain('No routes yet')
    expect(wrapper.find('[data-testid="card-plugins"]').text()).toContain('No plugins yet')
  })

  it('refreshes on demand and shows when it last did', async () => {
    const calls = stubKong()
    const wrapper = await mountDashboard()
    const before = calls.length

    expect(wrapper.text()).toMatch(/Updated \d/)
    await wrapper.find('[data-testid="dashboard-refresh"]').trigger('click')
    await flushPromises()

    expect(calls.length).toBe(before * 2)
  })
})
