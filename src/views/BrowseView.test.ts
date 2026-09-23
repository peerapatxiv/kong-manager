// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import BrowseView from './BrowseView.vue'
import ServiceDetail from '../components/browse/ServiceDetail.vue'
import { useConfigStore } from '../stores/config'

const SAMPLE = `_format_version: "3.0"
services:
- name: billing-service
  host: billing.internal
  port: 8080
  routes:
  - name: billing-route
    paths:
    - /billing
    plugins:
    - name: key-auth
      enabled: true
      protocols:
      - http
      config:
        key_names:
        - apikey
- name: reporting-service
  host: reporting.internal
  port: 9090
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

describe('BrowseView', () => {
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

  it('Services tab: shows a placeholder until a service is selected, then its detail form', async () => {
    const wrapper = mount(BrowseView)
    expect(wrapper.text()).toContain('Select a service from the list.')

    await wrapper.find('.font-mono.truncate').trigger('click')
    expect(wrapper.text()).toContain('billing-service')
    expect(wrapper.find('input[type="number"]').element).toHaveProperty('value', '8080')
  })

  it('Services tab: searching the service list filters it', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.find('input[placeholder="Search services…"]').setValue('reporting')

    expect(wrapper.text()).toContain('reporting-service')
    expect(wrapper.text()).not.toContain('billing-service')
  })

  it('Services tab: editing a selected service marks it modified in the sidebar list', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('li').find((li) => li.text().includes('billing-service'))!.trigger('click')

    // Scope to ServiceDetail itself — Sidebar's own slot wrapper is also `.flex-1`,
    // and its search box is also type="text".
    const hostInput = wrapper.findComponent(ServiceDetail).find('input[type="text"]')
    await hostInput.setValue('billing.internal.new')

    const store = useConfigStore()
    expect(store.isModified('service:billing-service')).toBe(true)
    expect(wrapper.findComponent({ name: 'Badge' }).exists()).toBe(true)
  })

  it('Services tab: expanding a route renders its route-level plugin as a multi-line-capable editor', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.find('.font-mono.truncate').trigger('click')
    const expandButton = wrapper.findAll('button').find((b) => b.text().includes('expand'))!
    await expandButton.trigger('click')

    expect(wrapper.text()).toContain('key-auth')
    expect(wrapper.text()).toContain('key_names')
  })
})
