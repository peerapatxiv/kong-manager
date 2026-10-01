// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import FileServicesView from './FileServicesView.vue'
import ServiceDetail from '../../components/browse/ServiceDetail.vue'
import { useConfigStore } from '../../stores/config'
import { SAMPLE } from './sample'

const make = () =>
  mount(FileServicesView, {
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })] },
  })
const rows = (w: ReturnType<typeof make>) => w.findAll('[data-testid="file-row"]')

beforeEach(() => setActivePinia(createPinia()))

describe('FileServicesView', () => {
  it('asks for a file when none is loaded', () => {
    expect(make().find('[data-testid="file-not-loaded"]').exists()).toBe(true)
  })

  describe('with a file loaded', () => {
    beforeEach(() => useConfigStore().loadPrimary('sample.yaml', SAMPLE))

    it('lists the services by name only, with a placeholder until one is chosen', () => {
      const wrapper = make()
      expect(rows(wrapper).map((r) => r.text())).toEqual(['billing-service', 'reporting-service'])
      expect(wrapper.text()).toContain('Select a service from the list to view and edit it.')
    })

    it('shows the detail form of the chosen service', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')

      expect(wrapper.text()).not.toContain('Select a service from the list')
      expect(wrapper.find('input[type="number"]').element).toHaveProperty('value', '8080')
    })

    it('filters the list as you search', async () => {
      const wrapper = make()
      await wrapper.find('input[placeholder="Search services…"]').setValue('reporting')
      expect(rows(wrapper).map((r) => r.text())).toEqual(['reporting-service'])
    })

    it('has no New button, since a loaded file cannot grow here', () => {
      expect(make().find('[data-testid="new-service"]').exists()).toBe(false)
    })

    it('stages an edit until Save, then updates the file and marks the service modified', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')

      await wrapper.findComponent(ServiceDetail).find('input[type="text"]').setValue('billing.internal.new')
      const store = useConfigStore()
      expect(store.primary?.config.services?.[0].host).toBe('billing.internal')
      expect(store.isModified('service:billing-service')).toBe(false)

      await wrapper.findComponent(ServiceDetail).findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

      expect(store.primary?.config.services?.[0].host).toBe('billing.internal.new')
      expect(store.isModified('service:billing-service')).toBe(true)
      expect(wrapper.findComponent({ name: 'Badge' }).exists()).toBe(true)
    })

    it('saves YAML edited in Code view', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      const detail = wrapper.findComponent(ServiceDetail)
      await detail.findAll('button').find((b) => b.text() === 'Code')!.trigger('click')
      const area = detail.find('textarea')
      await area.setValue((area.element as HTMLTextAreaElement).value.replace('8080', '9999'))
      await detail.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

      expect(useConfigStore().primary?.config.services?.[0].port).toBe(9999)
    })

    it('keeps the same service selected when it is renamed', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      const detail = wrapper.findComponent(ServiceDetail)
      await detail.findAll('button').find((b) => b.text() === 'Code')!.trigger('click')
      const area = detail.find('textarea')
      await area.setValue((area.element as HTMLTextAreaElement).value.replace('name: billing-service', 'name: billing-v2'))
      await detail.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

      expect(useConfigStore().primary?.config.services?.[0].name).toBe('billing-v2')
      expect(wrapper.text()).not.toContain('Select a service from the list')
    })
  })
})
