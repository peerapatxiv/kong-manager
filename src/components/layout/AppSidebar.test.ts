// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import AppSidebar from './AppSidebar.vue'
import { useConfigStore } from '../../stores/config'
import { useConnectionStore } from '../../stores/connection'
import { useTheme } from '../../lib/theme'

// jsdom's FileReader fires `load` via a real macrotask, not a microtask —
// `flushPromises()` doesn't wait long enough for it, so wait on a real timer.
function waitForFileRead() {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/compare', component: { template: '<div />' } },
      { path: '/live/services', component: { template: '<div />' } },
      ...['dashboard', 'services', 'routes', 'consumers', 'plugins'].map((page) => ({
        path: `/file/${page}`,
        component: { template: '<div />' },
      })),
    ],
  })
}

function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
}

describe('AppSidebar', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('hides the whole Live group until a connection exists, instead of showing locked links', () => {
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).not.toContain('Live')
    expect(wrapper.find('span[title="Connect to a live Kong first"]').exists()).toBe(false)
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Overview'])
  })

  it('links to the live services, routes, consumers and plugins once connected', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).toContain('Live')
    const live = wrapper.findAll('a').filter((a) => a.attributes('href')?.startsWith('/live'))
    expect(live.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Services', '/live/services'],
      ['Routes', '/live/routes'],
      ['Consumers', '/live/consumers'],
      ['Plugins', '/live/plugins'],
    ])
  })

  it('shows the connection name with its host in the footer only, not in the Live group', () => {
    useConnectionStore().$patch({
      active: { baseUrl: 'https://kong.example.com/admin-api', name: 'Kong CE' },
      info: { version: '3.5.0', database: 'postgres' },
    })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })
    const footer = wrapper.find('[data-testid="sidebar-footer"]')

    expect(footer.text()).toContain('Kong CE')
    expect(footer.text()).toContain('kong.example.com')
    expect(wrapper.text().split('Kong CE').length - 1).toBe(1)
    expect(wrapper.find('[data-testid="live-connection"]').exists()).toBe(false)
  })

  it('falls back to the host alone, shown once, when the connection has no name', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text().split('kong:8001').length - 1).toBe(1)
  })

  it('describes the live connection in the footer instead of "No config loaded"', () => {
    useConnectionStore().$patch({
      active: { baseUrl: 'https://kong.example.com/admin-api', name: 'Kong CE' },
      info: { version: '3.5.0', database: 'postgres' },
    })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })
    const footer = wrapper.find('[data-testid="sidebar-footer"]')

    expect(footer.text()).toContain('Connection')
    expect(footer.text()).toContain('Kong CE')
    expect(footer.text()).toContain('Kong 3.5.0')
    expect(footer.text()).toContain('postgres')
    expect(wrapper.text()).not.toContain('No config loaded')
  })

  it('links the file pages once a config is loaded, under a File heading, with Compare beside Overview', () => {
    useConfigStore().loadPrimary('a.yaml', '_format_version: "3.0"\nservices:\n- name: svc-a\n  host: a.internal\n')
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).toContain('File')
    expect(wrapper.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Overview', '/'],
      ['Compare', '/compare'],
      ['Dashboard', '/file/dashboard'],
      ['Services', '/file/services'],
      ['Routes', '/file/routes'],
      ['Consumers', '/file/consumers'],
      ['Plugins', '/file/plugins'],
    ])
  })

  describe('Disconnect button in the connection footer', () => {
    const connectLive = () =>
      useConnectionStore().$patch({
        active: { baseUrl: 'http://kong:8001', name: 'Kong CE' },
        info: { version: '3.5.0', database: 'postgres' },
      })
    const disconnectButton = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-testid="sidebar-disconnect"]')

    it('is a small icon beside the Connection heading, named and explained for screen readers and hover', () => {
      connectLive()
      const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })
      const footer = wrapper.find('[data-testid="sidebar-footer"]')
      const button = footer.find('[data-testid="sidebar-disconnect"]')

      expect(button.exists()).toBe(true)
      expect(button.attributes('aria-label')).toBe('Disconnect')
      expect(button.attributes('title')).toBe('Disconnect')
      expect(button.text()).toBe('')
      expect(button.find('svg').exists()).toBe(true)
      // On the same row as the heading, not a full-width button under the details.
      expect(button.element.parentElement?.textContent).toContain('Connection')
    })

    it('is not there without a live connection, or when a file is loaded instead', () => {
      expect(disconnectButton(mount(AppSidebar, { global: { plugins: [testRouter()] } })).exists()).toBe(false)

      connectLive()
      useConfigStore().loadPrimary('a.yaml', '_format_version: "3.0"\n')
      expect(disconnectButton(mount(AppSidebar, { global: { plugins: [testRouter()] } })).exists()).toBe(false)
    })

    it('ends the connection and goes back to the Overview page from a Live page', async () => {
      connectLive()
      const router = testRouter()
      router.push('/live/services')
      await router.isReady()
      const wrapper = mount(AppSidebar, { global: { plugins: [router] } })

      await disconnectButton(wrapper).trigger('click')
      await flushPromises()

      expect(useConnectionStore().isConnected).toBe(false)
      expect(router.currentRoute.value.path).toBe('/')
      expect(wrapper.text()).not.toContain('Live')
    })

    it('stays connected when leaving the page was cancelled, such as by an unsaved-changes prompt', async () => {
      connectLive()
      const router = testRouter()
      router.push('/live/services')
      await router.isReady()
      router.beforeEach((to, from) => (from.path === '/live/services' && to.path === '/' ? false : true))
      const wrapper = mount(AppSidebar, { global: { plugins: [router] } })

      await disconnectButton(wrapper).trigger('click')
      await flushPromises()

      expect(useConnectionStore().isConnected).toBe(true)
      expect(router.currentRoute.value.path).toBe('/live/services')
    })

    it('disconnects in place when already on the Overview page', async () => {
      connectLive()
      const router = testRouter()
      router.push('/')
      await router.isReady()
      const wrapper = mount(AppSidebar, { global: { plugins: [router] } })

      await disconnectButton(wrapper).trigger('click')
      await flushPromises()

      expect(useConnectionStore().isConnected).toBe(false)
    })
  })

  it('hides the file pages and Compare while connected live with no config', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).not.toContain('Compare')
    expect(wrapper.text()).not.toContain('File')
    expect(wrapper.find('span[title="Load a config first"]').exists()).toBe(false)
  })

  it('hides the Live group once a config is loaded, even if a connection is still open', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    useConfigStore().loadPrimary('a.yaml', '_format_version: "3.0"\nservices:\n- name: svc-a\n  host: a.internal\n')
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).not.toContain('Live')
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual([
      'Overview',
      'Compare',
      'Dashboard',
      'Services',
      'Routes',
      'Consumers',
      'Plugins',
    ])
  })

  it('hides the file pages, Compare and the Change control until a config is loaded', () => {
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).not.toContain('Compare')
    expect(wrapper.text()).not.toContain('Dashboard')
    expect(wrapper.find('span[title="Load a config first"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No config loaded')
    expect(wrapper.text()).not.toContain('Change')
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Overview'])
  })

  it('the Change control loads a new file and replaces the primary config in place', async () => {
    const store = useConfigStore()
    store.loadPrimary('a.yaml', '_format_version: "3.0"\nservices:\n- name: svc-a\n  host: a.internal\n')

    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement
    selectFile(
      input,
      new File(['_format_version: "3.0"\nservices:\n- name: svc-b\n  host: b.internal\n'], 'b.yaml'),
    )
    await wrapper.find('input[type="file"]').trigger('change')
    await waitForFileRead()

    expect(store.primary?.fileName).toBe('b.yaml')
    expect(store.primary?.config.services?.[0].name).toBe('svc-b')
    expect(wrapper.text()).toContain('b.yaml')
  })

  it('shows a parse-error message and leaves the current config untouched on invalid YAML', async () => {
    const store = useConfigStore()
    store.loadPrimary('a.yaml', '_format_version: "3.0"\n')

    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement
    selectFile(input, new File(['services: [unclosed'], 'bad.yaml'))
    await wrapper.find('input[type="file"]').trigger('change')
    await waitForFileRead()

    expect(wrapper.text()).toContain('Failed to parse YAML')
    expect(store.primary?.fileName).toBe('a.yaml')
  })

  describe('theme switch', () => {
    const themeSwitch = (wrapper: ReturnType<typeof mount>) => wrapper.find('button[role="switch"]')

    beforeEach(() => useTheme().setTheme('light'))

    it('is labelled Dark mode with the switch off in light mode, and on in dark mode', async () => {
      const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

      expect(themeSwitch(wrapper).text()).toContain('Dark mode')
      expect(themeSwitch(wrapper).text()).not.toContain('Light mode')
      expect(themeSwitch(wrapper).attributes('aria-checked')).toBe('false')

      await themeSwitch(wrapper).trigger('click')

      expect(themeSwitch(wrapper).text()).toContain('Dark mode')
      expect(themeSwitch(wrapper).attributes('aria-checked')).toBe('true')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('keeps the same icon in both modes so the icon, label and switch never disagree', async () => {
      const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })
      const before = themeSwitch(wrapper).find('svg').html()

      await themeSwitch(wrapper).trigger('click')

      expect(themeSwitch(wrapper).find('svg').html()).toBe(before)
    })
  })
})
