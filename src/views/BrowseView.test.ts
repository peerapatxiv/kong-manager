// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import BrowseView from './BrowseView.vue'
import { useConfigStore } from '../stores/config'

const SAMPLE = `_format_version: "3.0"
services: []
consumers: []
plugins:
- name: rate-limiting
  enabled: true
  protocols:
  - http
  config:
    minute: 100
- name: key-auth
  enabled: true
  protocols:
  - http
  config:
    key_names:
    - apikey
`

describe('BrowseView — Global Plugins tab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useConfigStore()
    store.loadPrimary('sample.yaml', SAMPLE)
  })

  it('lists global plugins and switches to the tab by default only after selecting it', () => {
    const wrapper = mount(BrowseView)
    // Services tab is active by default; Global Plugins tab is a click away.
    expect(wrapper.text()).not.toContain('rate-limiting')
  })

  it('shows plugin editors after selecting the Global Plugins tab', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Global Plugins')!.trigger('click')

    expect(wrapper.text()).toContain('rate-limiting')
    expect(wrapper.text()).toContain('key-auth')
  })

  it('filters the plugin list by name and marks an edited plugin as modified', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Global Plugins')!.trigger('click')

    await wrapper.find('input[placeholder="Search plugins…"]').setValue('rate')
    expect(wrapper.text()).toContain('rate-limiting')
    expect(wrapper.text()).not.toContain('key-auth')

    await wrapper.find('input[placeholder="Search plugins…"]').setValue('')

    const minuteInput = wrapper.find('input[type="number"]')
    await minuteInput.setValue(250)

    const store = useConfigStore()
    expect(store.isModified('plugin:global/rate-limiting')).toBe(true)
    expect(store.primary?.config.plugins?.[0].config?.minute).toBe(250)
  })
})
