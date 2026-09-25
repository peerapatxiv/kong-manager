// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import LoadView from './LoadView.vue'
import FileDropZone from '../components/FileDropZone.vue'
import { useConfigStore } from '../stores/config'
import * as kongAdminApi from '../lib/kongAdminApi'

vi.mock('../lib/kongAdminApi')

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
    setActivePinia(createPinia())
    vi.clearAllMocks()
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

  it('connects to a live Kong Admin API and shows it as the loaded source', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({
      _format_version: '3.0',
      services: [{ host: 'live.internal', name: 'svc-live' }],
    })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://localhost:8001')
    expect(wrapper.text()).toContain('Services: 1')
  })

  it('defaults to the Connect tab, and switches to the Upload file tab and back', async () => {
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    expect(wrapper.find('input[placeholder="http://localhost:8001"]').exists()).toBe(true)
    expect(wrapper.findComponent(FileDropZone).exists()).toBe(false)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Upload file')!
      .trigger('click')

    expect(wrapper.findComponent(FileDropZone).exists()).toBe(true)
    expect(wrapper.find('input[placeholder="http://localhost:8001"]').exists()).toBe(false)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect to Kong')!
      .trigger('click')

    expect(wrapper.find('input[placeholder="http://localhost:8001"]').exists()).toBe(true)
    expect(wrapper.findComponent(FileDropZone).exists()).toBe(false)
  })

  it('shows a connect error banner instead of crashing when the connection fails', async () => {
    vi.mocked(kongAdminApi.getConfig).mockRejectedValue(new Error('connection refused'))
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('connection refused')
    expect(wrapper.text()).not.toContain('Loaded:')
  })
})
