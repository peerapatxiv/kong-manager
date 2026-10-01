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
import { adminJson, KongAdminApiError } from '../lib/kongAdmin/http'

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
      { path: '/live/services', component: { template: '<div />' } },
      { path: '/live/routes', component: { template: '<div />' } },
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
    expect(wrapper.text()).toMatch(/Services\s+1/)
    expect(wrapper.text()).toMatch(/Routes\s+1/)
    expect(wrapper.text()).toMatch(/Consumers\s+1/)
    expect(wrapper.text()).toMatch(/Global plugins\s+1/)
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
    expect(wrapper.text()).toMatch(/Services\s+1/)
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
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
    const connectionStore = useConnectionStore()
    await connectionStore.connect({ baseUrl: 'http://kong-a:8001' })
    expect(connectionStore.active?.baseUrl).toBe('http://kong-a:8001')
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

  it('saves the connection name after a successful connect', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('[data-testid="host"]').setValue('localhost:8001')
    await wrapper.find('[data-testid="connection-name"]').setValue('Staging')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(useSavedConnectionsStore().connections[0]).toMatchObject({
      baseUrl: 'http://localhost:8001',
      name: 'Staging',
    })
  })

  it('keeps a saved connection name when reconnecting from the saved list', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    useSavedConnectionsStore().upsert({ baseUrl: 'http://localhost:8001', name: 'Staging' })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('li').trigger('click')
    await flushPromises()

    expect(useSavedConnectionsStore().connections[0]).toMatchObject({ name: 'Staging' })
  })

  it('never connects on its own when the page opens, even for an older entry that carries an automatic flag', async () => {
    localStorage.setItem(
      'kong-manager:saved-connections',
      JSON.stringify([{ id: '1', baseUrl: 'http://auto:8001', username: 'u', password: 'p', autoConnect: true }]),
    )
    setActivePinia(createPinia())

    mount(LoadView, { global: { plugins: [testRouter()] } })
    await flushPromises()

    expect(kongAdminApi.getConfig).not.toHaveBeenCalled()
  })

  describe('layout', () => {
    const columns = (wrapper: ReturnType<typeof mount>) => ({
      main: wrapper.find('[data-testid="load-main"]'),
      side: wrapper.find('[data-testid="saved-column"]'),
    })

    it('in Connect mode, shows the form in two thirds with the saved connections column beside it', () => {
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      expect(columns(wrapper).main.classes()).toContain('lg:col-span-2')
      expect((columns(wrapper).main.element.parentElement as HTMLElement).className).toContain('lg:grid-cols-3')
      expect(columns(wrapper).side.exists()).toBe(true)
    })

    it('puts the source tabs above both columns and aligns the saved column with the form instead of offsetting it', () => {
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      expect(columns(wrapper).main.text()).not.toContain('Upload file')
      expect(wrapper.text()).toContain('Upload file')
      expect(columns(wrapper).side.classes()).not.toContain('lg:mt-14')
    })

    it('in Upload mode, uses the full width and leaves no empty right column', async () => {
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      await wrapper
        .findAll('button')
        .find((b) => b.text().includes('Upload file'))!
        .trigger('click')

      const grid = columns(wrapper).main.element.parentElement as HTMLElement
      expect(grid.className).not.toContain('grid-cols-3')
      expect(columns(wrapper).main.classes()).not.toContain('lg:col-span-2')
      expect(columns(wrapper).side.exists()).toBe(false)
    })
  })

  describe('opening the page when something is already loaded', () => {
    it('starts with the source form collapsed when a config is already loaded', () => {
      useConfigStore().loadPrimary('sample-a.yaml', SAMPLE)

      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      expect(wrapper.text()).toContain('Loaded: sample-a.yaml')
      expect(wrapper.text()).not.toContain('Change source')
      expect(wrapper.text()).not.toContain('New Connection')
    })

    it('introduces a live connection as that, not as a config to load, and shows its access level', () => {
      useConnectionStore().$patch({
        active: { baseUrl: 'http://kong:8001', name: 'Kong CE' },
        info: { version: '3.4.0', database: 'postgres' },
      })

      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
      const card = wrapper.find('[data-testid="live-connected"]')

      expect(wrapper.find('h2').text()).toBe('Live Kong connection')
      expect(wrapper.text()).not.toContain('Browse this config below')
      expect(card.find('[data-testid="live-badges"]').text()).toContain('Kong 3.4.0')
      expect(card.find('[data-testid="live-badges"]').text()).toContain('postgres')
      expect(card.find('[data-testid="live-badges"]').text()).toContain('Read & write')
    })

    it('says the connection is read-only when Kong has no database to write to', () => {
      useConnectionStore().$patch({
        active: { baseUrl: 'http://kong:8001' },
        info: { version: '3.4.0', database: 'off' },
      })

      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      expect(wrapper.find('[data-testid="live-badges"]').text()).toContain('Read-only')
    })

    it('starts with the source form collapsed when a live connection already exists', () => {
      useConnectionStore().$patch({
        active: { baseUrl: 'http://kong:8001' },
        info: { version: '3.4.0', database: 'postgres' },
      })

      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      expect(wrapper.text()).toContain('Connected: http://kong:8001')
      expect(wrapper.text()).not.toContain('New Connection')
    })

    it('starts with the form open when nothing is loaded or connected', () => {
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      expect(wrapper.text()).toContain('New Connection')
    })

    it('has no Change source button for a loaded config or a live connection', () => {
      useConfigStore().loadPrimary('sample-a.yaml', SAMPLE)
      expect(mount(LoadView, { global: { plugins: [testRouter()] } }).text()).not.toContain('Change source')

      setActivePinia(createPinia())
      useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
      expect(mount(LoadView, { global: { plugins: [testRouter()] } }).text()).not.toContain('Change source')
    })
  })

  describe('with a config already loaded', () => {
    const loaded = () => {
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
      useConfigStore().loadPrimary('sample-a.yaml', SAMPLE)
      return wrapper
    }
    const button = (wrapper: ReturnType<typeof mount>, label: string) =>
      wrapper.findAll('button').find((b) => b.text() === label)

    it('shows the loaded summary above the source form, not below it', async () => {
      const wrapper = loaded()
      await wrapper.vm.$nextTick()

      const html = wrapper.html()
      expect(html).toContain('Loaded:')
      expect(html).toContain('New Connection')
      expect(html.indexOf('Loaded:')).toBeLessThan(html.indexOf('New Connection'))
    })

    it('labels the form as a different source and lets you cancel it', async () => {
      const wrapper = loaded()
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Load a different source')
      await button(wrapper, 'Cancel')!.trigger('click')

      expect(wrapper.text()).not.toContain('New Connection')
      expect(wrapper.text()).not.toContain('Load a different source')
    })

    it('shows no Cancel button or different-source heading when nothing is loaded', () => {
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      expect(button(wrapper, 'Cancel')).toBeUndefined()
      expect(wrapper.text()).not.toContain('Load a different source')
    })

    it('removes the loaded config with one click when there are no unsaved edits, and shows the source form', async () => {
      const wrapper = loaded()
      await wrapper.vm.$nextTick()

      await button(wrapper, 'Remove config')!.trigger('click')

      expect(useConfigStore().isLoaded).toBe(false)
      expect(wrapper.text()).not.toContain('Loaded:')
      expect(wrapper.text()).toContain('New Connection')
    })

    it('asks before removing a config with unsaved edits, and keeps it when cancelled', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const wrapper = loaded()
      useConfigStore().markModified('service:svc-a')
      await wrapper.vm.$nextTick()

      await button(wrapper, 'Remove config')!.trigger('click')
      expect(confirm).toHaveBeenCalled()
      expect(useConfigStore().isLoaded).toBe(true)

      confirm.mockReturnValue(true)
      await button(wrapper, 'Remove config')!.trigger('click')
      expect(useConfigStore().isLoaded).toBe(false)
      expect(useConfigStore().modifiedKeys.size).toBe(0)
    })

    it('does not offer Disconnect from a file-only config', async () => {
      const wrapper = loaded()
      await wrapper.vm.$nextTick()

      expect(button(wrapper, 'Disconnect')).toBeUndefined()
    })

    it('lays the four counts out two across on small screens and four across on large ones', async () => {
      const wrapper = loaded()
      await wrapper.vm.$nextTick()

      const stats = wrapper.find('[data-testid="load-stats"]')
      expect(stats.classes()).toContain('grid-cols-2')
      expect(stats.classes()).toContain('lg:grid-cols-4')
    })
  })

  describe('connecting to different kinds of Kong', () => {
    const connectTo = async (wrapper: ReturnType<typeof mount>, host = 'localhost:8001') => {
      await wrapper.find('[data-testid="host"]').setValue(host)
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Connect')!
        .trigger('click')
      await flushPromises()
    }

    it('goes straight to live editing for a database-backed Kong, without asking for /config', async () => {
      vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'postgres' } })
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      await connectTo(wrapper)

      expect(kongAdminApi.getConfig).not.toHaveBeenCalled()
      expect(useConfigStore().isLoaded).toBe(false)
      expect(useConnectionStore().canWrite).toBe(true)
      const card = wrapper.find('[data-testid="live-connected"]')
      expect(card.text()).toContain('http://localhost:8001')
      expect(card.text()).toContain('Kong 3.4.0')
      expect(card.text()).toContain('postgres')
      expect(card.text()).not.toContain('Open live services')
      expect(card.findAll('a')).toHaveLength(0)
      expect(wrapper.text()).not.toContain('Failed to connect')
    })

    it('saves the connection after a database-backed connect too', async () => {
      vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'postgres' } })
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      await connectTo(wrapper)

      expect(useSavedConnectionsStore().connections[0]).toMatchObject({ baseUrl: 'http://localhost:8001' })
    })

    it('still loads /config for a DB-less Kong', async () => {
      vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'off' } })
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      await connectTo(wrapper)

      expect(kongAdminApi.getConfig).toHaveBeenCalled()
      expect(wrapper.find('[data-testid="live-connected"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://localhost:8001')
    })

    it('tries /config when the database mode is not reported', async () => {
      vi.mocked(adminJson).mockResolvedValue({ version: '2.8.1' })
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      await connectTo(wrapper)

      expect(kongAdminApi.getConfig).toHaveBeenCalled()
    })

    it('explains an unreachable Kong in plain words instead of showing the raw error', async () => {
      vi.mocked(adminJson).mockRejectedValue(new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' }))
      vi.mocked(kongAdminApi.getConfig).mockRejectedValue(
        new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' }),
      )
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

      await connectTo(wrapper)

      expect(wrapper.text()).toContain('Could not reach http://localhost:8001')
      expect(wrapper.text()).toContain('CORS')
    })

    it('lets you disconnect a database-backed connection, which removes the Connected card', async () => {
      vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'postgres' } })
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
      await connectTo(wrapper)
      expect(wrapper.find('[data-testid="live-connected"]').exists()).toBe(true)

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Disconnect')!
        .trigger('click')

      expect(useConnectionStore().isConnected).toBe(false)
      expect(wrapper.find('[data-testid="live-connected"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('New Connection')
    })

    it('lets you disconnect from a loaded DB-less config without removing the config', async () => {
      vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'off' } })
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
      const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })
      await connectTo(wrapper)

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Disconnect')!
        .trigger('click')

      expect(useConnectionStore().isConnected).toBe(false)
      expect(useConfigStore().isLoaded).toBe(true)
      expect(wrapper.text()).not.toContain('Open live services')
    })

    it('offers the Live views from a loaded config only when a live connection exists', async () => {
      vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'off' } })
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
      const fileOnly = mount(LoadView, { global: { plugins: [testRouter()] } })
      useConfigStore().loadPrimary('sample.yaml', SAMPLE)
      await fileOnly.vm.$nextTick()
      expect(fileOnly.text()).not.toContain('Open live services')

      setActivePinia(createPinia())
      const connected = mount(LoadView, { global: { plugins: [testRouter()] } })
      await connectTo(connected)

      expect(connected.text()).toContain('Open live services')
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

  it('collapses the form after a successful load', async () => {
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Upload file')!
      .trigger('click')
    await wrapper.findComponent(FileDropZone).vm.$emit('file-selected', { fileName: 'sample-a.yaml', text: SAMPLE })
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(FileDropZone).exists()).toBe(false)
    expect(wrapper.text()).toContain('Loaded: sample-a.yaml')
    expect(wrapper.text()).not.toContain('Change source')
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
