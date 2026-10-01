// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import FilePluginsView from './FilePluginsView.vue'
import { useConfigStore } from '../../stores/config'
import { SAMPLE } from './sample'

const make = () =>
  mount(FilePluginsView, {
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })] },
  })
const rows = (w: ReturnType<typeof make>) => w.findAll('[data-testid="file-row"]')
const save = (w: ReturnType<typeof make>) => w.findAll('button').find((b) => b.text() === 'Save')!

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.restoreAllMocks())

describe('FilePluginsView', () => {
  it('asks for a file when none is loaded', () => {
    expect(make().find('[data-testid="file-not-loaded"]').exists()).toBe(true)
  })

  describe('with a file loaded', () => {
    beforeEach(() => useConfigStore().loadPrimary('sample.yaml', SAMPLE))

    it('lists the plugins of every level by name only, even when names repeat', () => {
      const wrapper = make()
      expect(rows(wrapper).map((r) => r.text())).toEqual(['rate-limiting', 'key-auth', 'key-auth', 'cors'])
      expect(wrapper.text()).toContain('Select a plugin from the list to view and edit it.')
    })

    it('filters by plugin name or by what it applies to', async () => {
      const wrapper = make()
      await wrapper.find('input[placeholder="Search plugins…"]').setValue('rate')
      expect(rows(wrapper).map((r) => r.text())).toEqual(['rate-limiting'])
      await wrapper.find('input[placeholder="Search plugins…"]').setValue('billing-route')
      expect(rows(wrapper).map((r) => r.text())).toEqual(['key-auth'])
    })

    it('shows the editor, and where the plugin applies, for the chosen plugin', async () => {
      const wrapper = make()
      await rows(wrapper)[2].trigger('click')

      expect(wrapper.text()).toContain('Applies to route: billing-route')
      expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    })

    it('says a plugin without a scope applies globally', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      expect(wrapper.text()).toContain('Applies to everything (global)')
    })

    it('stages an edit until Save, then updates that plugin and marks only it modified', async () => {
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')

      await wrapper.find('input[type="number"]').setValue(250)
      const store = useConfigStore()
      expect(store.primary?.config.plugins?.[0].config?.minute).toBe(100)
      expect(store.modifiedKeys.size).toBe(0)

      await save(wrapper).trigger('click')

      expect(store.primary?.config.plugins?.[0].config?.minute).toBe(250)
      expect(store.isModified('plugin:g/0')).toBe(true)
      expect(store.isModified('plugin:g/1')).toBe(false)
    })

    it('edits a plugin nested inside a route without touching the one that shares its name', async () => {
      const wrapper = make()
      await rows(wrapper)[2].trigger('click')
      const toggle = wrapper.find('input[type="checkbox"]')
      await toggle.setValue(false)
      await save(wrapper).trigger('click')

      const config = useConfigStore().primary!.config
      expect(config.services![0].routes![0].plugins![0].enabled).toBe(false)
      expect(config.plugins![1].enabled).toBe(true)
    })

    it('asks before dropping unsaved edits when another plugin is picked, and keeps them on cancel', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const wrapper = make()
      await rows(wrapper)[0].trigger('click')
      await wrapper.find('input[type="number"]').setValue(5)

      await rows(wrapper)[1].trigger('click')

      expect(confirm).toHaveBeenCalledWith('Discard your unsaved changes?')
      expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('5')
    })
  })
})
