// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import LoadView from './LoadView.vue'
import FileDropZone from '../components/FileDropZone.vue'
import { useConfigStore } from '../stores/config'

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

    await wrapper.findComponent(FileDropZone).vm.$emit('file-selected', {
      fileName: 'bad.yaml',
      text: 'services: [unclosed',
    })

    expect(wrapper.text()).toContain('Failed to parse YAML')
    expect(wrapper.find('.border-red-300').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Loaded:')
  })
})
