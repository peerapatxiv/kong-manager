// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import FileConsumersView from './FileConsumersView.vue'
import ConsumerDetail from '../../components/browse/ConsumerDetail.vue'
import { useConfigStore } from '../../stores/config'
import { SAMPLE } from './sample'

const make = () =>
  mount(FileConsumersView, {
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })] },
  })
const rows = (w: ReturnType<typeof make>) => w.findAll('[data-testid="file-row"]')

beforeEach(() => setActivePinia(createPinia()))

describe('FileConsumersView', () => {
  it('asks for a file when none is loaded', () => {
    expect(make().find('[data-testid="file-not-loaded"]').exists()).toBe(true)
  })

  describe('with a file loaded', () => {
    beforeEach(() => useConfigStore().loadPrimary('sample.yaml', SAMPLE))

    it('lists the consumers by name only, with a placeholder until one is chosen', () => {
      const wrapper = make()
      expect(rows(wrapper).map((r) => r.text())).toEqual(['alice', 'admin-user'])
      expect(wrapper.text()).toContain('Select a consumer from the list to view and edit it.')
    })

    it('filters the list as you search', async () => {
      const wrapper = make()
      await wrapper.find('input[placeholder="Search consumers…"]').setValue('admin')
      expect(rows(wrapper).map((r) => r.text())).toEqual(['admin-user'])
    })

    it('masks credential secrets by default, with a reveal toggle', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')

      const detail = wrapper.findComponent(ConsumerDetail)
      const keyField = detail.find('input[type="password"]')
      expect(keyField.exists()).toBe(true)
      expect((keyField.element as HTMLInputElement).value).toBe('abc123key')

      await detail.find('button[aria-label="Reveal value"]').trigger('click')
      expect(detail.find('input[type="password"]').exists()).toBe(false)
    })

    it('stages an edit until Save, then updates the file and marks the consumer modified', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      const detail = wrapper.findComponent(ConsumerDetail)

      await detail.findAll('input[type="text"]')[1].setValue('cust-1-renamed')
      const store = useConfigStore()
      expect(store.primary?.config.consumers?.[0].custom_id).toBe('cust-1')

      await detail.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

      expect(store.primary?.config.consumers?.[0].custom_id).toBe('cust-1-renamed')
      expect(store.isModified('consumer:alice')).toBe(true)
    })

    it('keeps the same consumer selected when it is renamed', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      const detail = wrapper.findComponent(ConsumerDetail)
      await detail.findAll('input[type="text"]')[0].setValue('alice-renamed')
      await detail.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')

      expect(useConfigStore().isModified('consumer:alice-renamed')).toBe(true)
      expect(wrapper.text()).not.toContain('Select a consumer from the list')
    })
  })
})
