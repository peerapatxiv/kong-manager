// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
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
      { path: '/browse', component: { template: '<div />' } },
      { path: '/compare', component: { template: '<div />' } },
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
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Load'])
  })

  it('links to the live services, routes and consumers once connected', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).toContain('Live')
    const live = wrapper.findAll('a').filter((a) => a.attributes('href')?.startsWith('/live'))
    expect(live.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Services', '/live/services'],
      ['Routes', '/live/routes'],
      ['Consumers', '/live/consumers'],
    ])
  })

  it('shows the connection name with its host in the Live group', () => {
    useConnectionStore().$patch({
      active: { baseUrl: 'https://kong.example.com/admin-api', name: 'Kong CE' },
      info: { version: '3.5.0', database: 'postgres' },
    })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.find('[data-testid="live-connection"]').text()).toContain('Kong CE')
    expect(wrapper.find('[data-testid="live-connection"]').text()).toContain('kong.example.com')
  })

  it('falls back to the host alone when the connection has no name', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.find('[data-testid="live-connection"]').text()).toBe('kong:8001')
  })

  it('hides the locked Browse and Compare entries while connected live with no config', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).not.toContain('Browse')
    expect(wrapper.text()).not.toContain('Compare')
    expect(wrapper.find('span[title="Load a config first"]').exists()).toBe(false)
  })

  it('hides the Live group once a config is loaded, even if a connection is still open', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    useConfigStore().loadPrimary('a.yaml', '_format_version: "3.0"\nservices:\n- name: svc-a\n  host: a.internal\n')
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).not.toContain('Live')
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Load', 'Browse', 'Compare'])
  })

  it('shows disabled Browse/Compare links and no Change control until a config is loaded', () => {
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).toContain('No config loaded')
    expect(wrapper.text()).not.toContain('Change')
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Load'])
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
