// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveDashboardView from './LiveDashboardView.vue'
import { useConnectionStore } from '../../stores/connection'

const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() })

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  const wrapper = mount(LiveDashboardView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

describe('LiveDashboardView', () => {
  it('asks the user to connect, without sending any request, when not connected', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="live-not-connected"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="live-dashboard"]').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the dashboard when connected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ data: [], offset: null })))
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.5.0', database: 'postgres' } })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="live-dashboard"]').exists()).toBe(true)
  })
})
