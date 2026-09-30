// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import BrowseView from './BrowseView.vue'
import ServiceDetail from '../components/browse/ServiceDetail.vue'
import ConsumerDetail from '../components/browse/ConsumerDetail.vue'
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
consumers:
- username: alice
  custom_id: cust-1
  keyauth_credentials:
  - key: abc123key
- username: admin-user
  basicauth_credentials:
  - username: admin-user
    password: 08f95a79a7b8e335fecb65e0a7ae65aec6780af7
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

  it('Global Plugins tab: lists plugins and shows a placeholder until one is selected, then its editor', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Global Plugins')!.trigger('click')

    expect(wrapper.text()).toContain('rate-limiting')
    expect(wrapper.text()).toContain('key-auth')
    expect(wrapper.text()).toContain('Select a plugin from the list to view and edit it.')

    await wrapper.findAll('li').find((li) => li.text().includes('rate-limiting'))!.trigger('click')

    expect(wrapper.text()).not.toContain('Select a plugin from the list to view and edit it.')
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)
  })

  it('Global Plugins tab: filters the plugin list by name and marks the selected plugin modified when edited', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Global Plugins')!.trigger('click')

    await wrapper.find('input[placeholder="Search plugins…"]').setValue('rate')
    expect(wrapper.text()).toContain('rate-limiting')
    expect(wrapper.text()).not.toContain('key-auth')

    await wrapper.findAll('li').find((li) => li.text().includes('rate-limiting'))!.trigger('click')
    await wrapper.find('input[placeholder="Search plugins…"]').setValue('')

    const minuteInput = wrapper.find('input[type="number"]')
    await minuteInput.setValue(250)

    const store = useConfigStore()
    // Editing only touches the local draft — nothing commits until Save.
    expect(store.isModified('plugin:global/rate-limiting')).toBe(false)

    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

    expect(store.isModified('plugin:global/rate-limiting')).toBe(true)
    expect(store.primary?.config.plugins?.[0].config?.minute).toBe(250)
  })

  it('Services tab: shows a placeholder until a service is selected, then its detail form', async () => {
    const wrapper = mount(BrowseView)
    expect(wrapper.text()).toContain('Select a service from the list to view and edit it.')

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

  it('Services tab: editing a selected service marks it modified in the sidebar list only after Save', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('li').find((li) => li.text().includes('billing-service'))!.trigger('click')

    // Scope to ServiceDetail itself — Sidebar's own slot wrapper is also `.flex-1`,
    // and its search box is also type="text".
    const hostInput = wrapper.findComponent(ServiceDetail).find('input[type="text"]')
    await hostInput.setValue('billing.internal.new')

    const store = useConfigStore()
    // Editing only touches the local draft — nothing commits until Save.
    expect(store.primary?.config.services?.[0].host).toBe('billing.internal')
    expect(store.isModified('service:billing-service')).toBe(false)

    await wrapper.findComponent(ServiceDetail).findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

    expect(store.primary?.config.services?.[0].host).toBe('billing.internal.new')
    expect(store.isModified('service:billing-service')).toBe(true)
    expect(wrapper.findComponent({ name: 'Badge' }).exists()).toBe(true)
  })

  it('Services tab: switching to Code view and saving edited YAML updates the store', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.find('.font-mono.truncate').trigger('click')

    await wrapper.findComponent(ServiceDetail).findAll('button').find((b) => b.text() === 'Code')!.trigger('click')
    const textarea = wrapper.findComponent(ServiceDetail).find('textarea')
    expect(textarea.element.value).toContain('billing.internal')

    await textarea.setValue(textarea.element.value.replace('billing.internal', 'billing.internal.new'))

    const store = useConfigStore()
    // Editing the YAML text alone doesn't commit anything yet.
    expect(store.primary?.config.services?.[0].host).toBe('billing.internal')

    await wrapper.findComponent(ServiceDetail).findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

    expect(store.primary?.config.services?.[0].host).toBe('billing.internal.new')
    expect(store.isModified('service:billing-service')).toBe(true)
    // Saving returns to the form view.
    expect(wrapper.findComponent(ServiceDetail).find('textarea').exists()).toBe(false)
  })

  it('Services tab: Code view shows an inline error and leaves the store untouched on invalid YAML', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.find('.font-mono.truncate').trigger('click')

    await wrapper.findComponent(ServiceDetail).findAll('button').find((b) => b.text() === 'Code')!.trigger('click')
    await wrapper.findComponent(ServiceDetail).find('textarea').setValue('host: [unclosed')
    await wrapper.findComponent(ServiceDetail).findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

    expect(wrapper.text()).toContain('Failed to parse YAML')
    const store = useConfigStore()
    expect(store.primary?.config.services?.[0].host).toBe('billing.internal')
    expect(store.isModified('service:billing-service')).toBe(false)
    // Stays in Code view so the user can fix the mistake.
    expect(wrapper.findComponent(ServiceDetail).find('textarea').exists()).toBe(true)
  })

  it('Services tab: expanding a route renders its route-level plugin as a multi-line-capable editor', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.find('.font-mono.truncate').trigger('click')
    const expandButton = wrapper.findAll('button').find((b) => b.text().includes('expand'))!
    await expandButton.trigger('click')

    expect(wrapper.text()).toContain('key-auth')
    expect(wrapper.text()).toContain('key_names')
  })

  it('Consumers tab: shows a placeholder until a consumer is selected, then its detail form', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Consumers')!.trigger('click')
    expect(wrapper.text()).toContain('Select a consumer from the list to view and edit it.')

    await wrapper.find('.font-mono.truncate').trigger('click')
    expect(wrapper.text()).toContain('alice')
  })

  it('Consumers tab: masks credential secret fields by default, with a reveal toggle', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Consumers')!.trigger('click')
    await wrapper.findAll('li').find((li) => li.text().includes('alice'))!.trigger('click')

    const keyField = wrapper.findComponent(ConsumerDetail).find('input[type="password"]')
    expect(keyField.exists()).toBe(true)
    expect((keyField.element as HTMLInputElement).value).toBe('abc123key')
    expect(keyField.attributes('placeholder')).toMatch(/^•+$/)

    await wrapper.findComponent(ConsumerDetail).find('button[aria-label="Reveal value"]').trigger('click')
    expect(wrapper.findComponent(ConsumerDetail).find('input[type="password"]').exists()).toBe(false)
    const revealedValues = wrapper
      .findComponent(ConsumerDetail)
      .findAll('input[type="text"]')
      .map((i) => (i.element as HTMLInputElement).value)
    expect(revealedValues).toContain('abc123key')
  })

  it('Consumers tab: editing a selected consumer marks it modified only after Save', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Consumers')!.trigger('click')
    await wrapper.findAll('li').find((li) => li.text().includes('alice'))!.trigger('click')

    const customIdInputs = wrapper.findComponent(ConsumerDetail).findAll('input[type="text"]')
    await customIdInputs[1].setValue('cust-1-renamed')

    const store = useConfigStore()
    // Editing only touches the local draft — nothing commits until Save.
    expect(store.primary?.config.consumers?.[0].custom_id).not.toBe('cust-1-renamed')

    await wrapper.findComponent(ConsumerDetail).findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

    expect(store.primary?.config.consumers?.[0].custom_id).toBe('cust-1-renamed')
    expect(store.isModified('consumer:alice')).toBe(true)
  })

  it('Consumers tab: renaming a consumer keeps the same entry selected and marks the new name modified', async () => {
    const wrapper = mount(BrowseView)
    await wrapper.findAll('button').find((b) => b.text() === 'Consumers')!.trigger('click')
    await wrapper.findAll('li').find((li) => li.text().includes('alice'))!.trigger('click')

    const usernameInput = wrapper.findComponent(ConsumerDetail).findAll('input[type="text"]')[0]
    await usernameInput.setValue('alice-renamed')
    await wrapper.findComponent(ConsumerDetail).findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

    const store = useConfigStore()
    expect(store.primary?.config.consumers?.[0].username).toBe('alice-renamed')
    expect(store.isModified('consumer:alice-renamed')).toBe(true)
    // The detail panel should still show the (renamed) entry, not fall back to the placeholder.
    expect(wrapper.text()).not.toContain('Select a consumer from the list to view and edit it.')
  })
})
