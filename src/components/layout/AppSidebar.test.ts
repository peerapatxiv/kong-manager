// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import AppSidebar from './AppSidebar.vue'
import { useConfigStore } from '../../stores/config'
import { useConnectionStore } from '../../stores/connection'

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

  it('shows Live links as disabled placeholders, not anchors, until a connection exists', () => {
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).toContain('Live')
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Load'])
    expect(wrapper.findAll('span[title="Connect to a live Kong first"]')).toHaveLength(2)
  })

  it('links to the live services and routes once connected', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    const live = wrapper.findAll('a').filter((a) => a.attributes('href')?.startsWith('/live'))
    expect(live.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Services', '/live/services'],
      ['Routes', '/live/routes'],
    ])
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
})
