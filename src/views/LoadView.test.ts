// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import LoadView from './LoadView.vue'
import FileDropZone from '../components/FileDropZone.vue'
import { useConfigStore } from '../stores/config'
import { useSavedConnectionsStore } from '../stores/savedConnections'
import * as kongAdminApi from '../lib/kongAdminApi'

vi.mock('../lib/kongAdminApi')

import { useConnectionStore } from '../stores/connection'
import { adminJson } from '../lib/kongAdmin/http'

vi.mock('../lib/kongAdmin/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/kongAdmin/http')>()),
  adminJson: vi.fn(),
}))

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: LoadView },
      { path: '/browse', component: { template: '<div />' } },
    ],
  })
}

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
  routes:
  - name: route-a
    paths:
    - /a
consumers:
- username: alice
plugins:
- name: rate-limiting
`

describe('LoadView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'off' } })
  })

  it('shows the summary card and no error banner after a successful load', async () => {
    const wrapper = mount(LoadView, {
      global: { plugins: [testRouter()] },
    })
    const store = useConfigStore()

    store.loadPrimary('sample-a.yaml', SAMPLE)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Loaded: sample-a.yaml')
    expect(wrapper.text()).toContain('Services: 1')
    expect(wrapper.text()).toContain('Routes: 1')
    expect(wrapper.text()).toContain('Consumers: 1')
    expect(wrapper.text()).toContain('Global plugins: 1')
    expect(wrapper.text()).not.toContain('Failed to parse YAML')
  })

  it('shows the error banner instead of crashing when the dropped file fails to parse', async () => {
    const wrapper = mount(LoadView, {
      global: { plugins: [testRouter()] },
    })

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Upload file')!
      .trigger('click')
    await wrapper.findComponent(FileDropZone).vm.$emit('file-selected', {
      fileName: 'bad.yaml',
      text: 'services: [unclosed',
    })

    expect(wrapper.text()).toContain('Failed to parse YAML')
    expect(wrapper.find('.border-red-300').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Loaded:')
  })

  it('fills the full content width instead of a narrow centered column', () => {
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
    const root = wrapper.element as HTMLElement

    expect(root.classList.contains('mx-auto')).toBe(false)
    expect(Array.from(root.classList).some((c) => c.startsWith('max-w-'))).toBe(false)
  })

  it('connects to a live Kong Admin API and shows it as the loaded source', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({
      _format_version: '3.0',
      services: [{ host: 'live.internal', name: 'svc-live' }],
    })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('[data-testid="host"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://localhost:8001')
    expect(wrapper.text()).toContain('Services: 1')
  })

  it('auto-saves the connection after a successful connect', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('[data-testid="host"]').setValue('http://localhost:8001')
    await wrapper.find('[data-testid="username"]').setValue('admin')
    await wrapper.find('input[type="password"]').setValue('hunter2')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    const savedConnectionsStore = useSavedConnectionsStore()
    expect(savedConnectionsStore.connections).toEqual([
      expect.objectContaining({ baseUrl: 'http://localhost:8001', username: 'admin', password: 'hunter2' }),
    ])
  })

  it('probes the Kong node after connecting so live editing can be gated on database mode', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('[data-testid="host"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    const connectionStore = useConnectionStore()
    expect(connectionStore.isConnected).toBe(true)
    expect(connectionStore.canWrite).toBe(false)
    expect(connectionStore.active?.baseUrl).toBe('http://localhost:8001')
  })

  it('still shows the loaded config, with no error banner, when the node probe fails', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({
      _format_version: '3.0',
      services: [{ host: 'live.internal', name: 'svc-live' }],
    })
    vi.mocked(adminJson).mockRejectedValue(new Error('probe failed'))
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('[data-testid="host"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://localhost:8001')
    expect(wrapper.text()).not.toContain('Failed to connect')
    expect(useConnectionStore().isConnected).toBe(false)
  })

  it('drops a previous live connection when the node probe for a newly loaded Kong fails', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    const connectionStore = useConnectionStore()
    await connectionStore.connect({ baseUrl: 'http://kong-a:8001' })
    expect(connectionStore.active?.baseUrl).toBe('http://kong-a:8001')
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
    vi.mocked(adminJson).mockRejectedValue(new Error('probe failed'))

    await wrapper.find('[data-testid="host"]').setValue('http://kong-b:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(connectionStore.isConnected).toBe(false)
  })

  it('no longer shows the Browse, Edit and Compare feature cards, only the New Connection form and saved list', () => {
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).not.toContain('Inspect services, routes, consumers')
    expect(wrapper.text()).not.toContain('Use guided forms')
    expect(wrapper.text()).not.toContain('Diff two configs')
    expect(wrapper.text()).toContain('New Connection')
    expect(wrapper.text()).toContain('Saved Connections')
  })

  it('saves the connection name, colour and automatic flag after a successful connect', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('[data-testid="host"]').setValue('localhost:8001')
    await wrapper.find('[data-testid="connection-name"]').setValue('Staging')
    await wrapper.find('[data-testid="connection-color"]').setValue('#ff0000')
    await wrapper.find('[data-testid="auto-connect"]').setValue(true)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(useSavedConnectionsStore().connections[0]).toMatchObject({
      baseUrl: 'http://localhost:8001',
      name: 'Staging',
      colorCode: '#ff0000',
      autoConnect: true,
    })
  })

  it('keeps a saved connection name and colour when reconnecting from the saved list', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    useSavedConnectionsStore().upsert({ baseUrl: 'http://localhost:8001', name: 'Staging', colorCode: '#ff0000' })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('li').trigger('click')
    await flushPromises()

    expect(useSavedConnectionsStore().connections[0]).toMatchObject({ name: 'Staging', colorCode: '#ff0000' })
  })

  describe('connect automatically', () => {
    it('connects the automatic saved connection with its stored credentials when the page opens', async () => {
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
      useSavedConnectionsStore().upsert({
        baseUrl: 'http://auto:8001',
        username: 'u',
        password: 'p',
        autoConnect: true,
      })

      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
      await flushPromises()

      expect(kongAdminApi.getConfig).toHaveBeenCalledWith('http://auto:8001', { username: 'u', password: 'p' })
      expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://auto:8001')
    })

    it('does nothing when no connection is marked automatic', async () => {
      useSavedConnectionsStore().upsert({ baseUrl: 'http://manual:8001' })

      mount(LoadView, { global: { plugins: [testRouter()] } })
      await flushPromises()

      expect(kongAdminApi.getConfig).not.toHaveBeenCalled()
    })

    it('does nothing when a config is already loaded', async () => {
      useSavedConnectionsStore().upsert({ baseUrl: 'http://auto:8001', autoConnect: true })
      useConfigStore().loadPrimary('sample.yaml', SAMPLE)

      mount(LoadView, { global: { plugins: [testRouter()] } })
      await flushPromises()

      expect(kongAdminApi.getConfig).not.toHaveBeenCalled()
    })

    it('runs only once per session, not on every visit to the page', async () => {
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
      useSavedConnectionsStore().upsert({ baseUrl: 'http://auto:8001', autoConnect: true })

      mount(LoadView, { global: { plugins: [testRouter()] } }).unmount()
      await flushPromises()
      useConfigStore().primary = null
      mount(LoadView, { global: { plugins: [testRouter()] } })
      await flushPromises()

      expect(kongAdminApi.getConfig).toHaveBeenCalledTimes(1)
    })

    it('shows the usual error banner when the automatic connection fails', async () => {
      vi.mocked(kongAdminApi.getConfig).mockRejectedValue(new Error('connection refused'))
      useSavedConnectionsStore().upsert({ baseUrl: 'http://auto:8001', autoConnect: true })

      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
      await flushPromises()

      expect(wrapper.text()).toContain('connection refused')
    })
  })

  it('reconnects instantly using stored credentials when a saved connection is clicked', async () => {
    const savedConnectionsStore = useSavedConnectionsStore()
    savedConnectionsStore.upsert({ baseUrl: 'http://localhost:8001', username: 'admin', password: 'hunter2' })
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({
      _format_version: '3.0',
      services: [{ host: 'live.internal', name: 'svc-live' }],
    })

    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
    await wrapper.find('li').trigger('click')
    await flushPromises()

    expect(kongAdminApi.getConfig).toHaveBeenCalledWith('http://localhost:8001', {
      username: 'admin',
      password: 'hunter2',
    })
    expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://localhost:8001')
  })

  it('defaults to the Connect tab, and switches to the Upload file tab and back', async () => {
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    expect(wrapper.find('[data-testid="host"]').exists()).toBe(true)
    expect(wrapper.findComponent(FileDropZone).exists()).toBe(false)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Upload file')!
      .trigger('click')

    expect(wrapper.findComponent(FileDropZone).exists()).toBe(true)
    expect(wrapper.find('[data-testid="host"]').exists()).toBe(false)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect to Kong')!
      .trigger('click')

    expect(wrapper.find('[data-testid="host"]').exists()).toBe(true)
    expect(wrapper.findComponent(FileDropZone).exists()).toBe(false)
  })

  it('collapses the form after a successful load, and re-expands it via Change source', async () => {
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Upload file')!
      .trigger('click')
    await wrapper.findComponent(FileDropZone).vm.$emit('file-selected', { fileName: 'sample-a.yaml', text: SAMPLE })
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(FileDropZone).exists()).toBe(false)
    expect(wrapper.text()).toContain('Loaded: sample-a.yaml')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Change source')!
      .trigger('click')

    expect(wrapper.findComponent(FileDropZone).exists()).toBe(true)
  })

  it('shows a connect error banner instead of crashing when the connection fails', async () => {
    vi.mocked(kongAdminApi.getConfig).mockRejectedValue(new Error('connection refused'))
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('[data-testid="host"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('connection refused')
    expect(wrapper.text()).not.toContain('Loaded:')
  })
})
