// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import FileRoutesView from './FileRoutesView.vue'
import { useConfigStore } from '../../stores/config'
import { SAMPLE } from './sample'

const make = () =>
  mount(FileRoutesView, {
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })] },
  })
const rows = (w: ReturnType<typeof make>) => w.findAll('[data-testid="file-row"]')
const save = (w: ReturnType<typeof make>) => w.findAll('button').find((b) => b.text() === 'Save')!

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.restoreAllMocks())

describe('FileRoutesView', () => {
  it('asks for a file when none is loaded', () => {
    expect(make().find('[data-testid="file-not-loaded"]').exists()).toBe(true)
  })

  describe('with a file loaded', () => {
    beforeEach(() => useConfigStore().loadPrimary('sample.yaml', SAMPLE))

    it('lists every route in the file by name, using its path when it has no name', () => {
      const wrapper = make()
      expect(rows(wrapper).map((r) => r.text())).toEqual(['billing-route', '/refunds'])
      expect(wrapper.text()).toContain('Select a route from the list to view and edit it.')
    })

    it('filters by route name, path or service', async () => {
      const wrapper = make()
      await wrapper.find('input[placeholder="Search routes…"]').setValue('refunds')
      expect(rows(wrapper)).toHaveLength(1)
      await wrapper.find('input[placeholder="Search routes…"]').setValue('billing-service')
      expect(rows(wrapper)).toHaveLength(2)
      await wrapper.find('input[placeholder="Search routes…"]').setValue('reporting-service')
      expect(rows(wrapper)).toHaveLength(0)
    })

    it('opens the route editor straight away, and says which service the route belongs to', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')

      expect(wrapper.text()).toContain('Service: billing-service')
      expect((wrapper.find('input[placeholder="(unnamed route)"]').element as HTMLInputElement).value).toBe('billing-route')
    })

    it('stages an edit until Save, then updates the route in its service and marks only that route modified', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')

      await wrapper.find('input[placeholder="(unnamed route)"]').setValue('billing-route-v2')
      const store = useConfigStore()
      expect(store.primary?.config.services?.[0].routes?.[0].name).toBe('billing-route')
      expect(wrapper.text()).toContain('Unsaved changes')

      await save(wrapper).trigger('click')

      expect(store.primary?.config.services?.[0].routes?.[0].name).toBe('billing-route-v2')
      expect(store.isModified('route:0/0')).toBe(true)
      expect(store.isModified('route:0/1')).toBe(false)
      expect(rows(wrapper)[0].text()).toContain('billing-route-v2')
    })

    it('keeps the edited route selected after it is renamed', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      await wrapper.find('input[placeholder="(unnamed route)"]').setValue('renamed')
      await save(wrapper).trigger('click')

      expect(wrapper.text()).not.toContain('Select a route from the list')
    })

    it('keeps Save and Discard in the pinned bar at the bottom, shown only once something is selected', async () => {
      const wrapper = make()
      expect(wrapper.find('[data-testid="live-detail-footer"]').exists()).toBe(false)

      await rows(wrapper)[0].trigger('click')

      const footer = wrapper.find('[data-testid="live-detail-footer"]')
      expect(footer.exists()).toBe(true)
      expect(footer.findAll('button').map((b) => b.text())).toEqual(['Discard', 'Save'])
    })

    it('asks before dropping unsaved edits when another route is picked, and keeps them on cancel', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      await wrapper.find('input[placeholder="(unnamed route)"]').setValue('edited')

      await rows(wrapper)[1].trigger('click')

      expect(confirm).toHaveBeenCalledWith('Discard your unsaved changes?')
      expect((wrapper.find('input[placeholder="(unnamed route)"]').element as HTMLInputElement).value).toBe('edited')
    })
  })
})
