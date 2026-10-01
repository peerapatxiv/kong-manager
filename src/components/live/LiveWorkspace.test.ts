// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import LiveWorkspace from './LiveWorkspace.vue'

describe('LiveWorkspace', () => {
  beforeEach(() => localStorage.clear())

  it('puts each slot in its own region, with a drag handle between the list and the detail', () => {
    const wrapper = mount(LiveWorkspace, {
      props: { storageKey: 'test:ws' },
      slots: { toolbar: '<i id="t"/>', list: '<i id="l"/>', footer: '<i id="f"/>', detail: '<i id="d"/>' },
    })
    const panel = wrapper.find('[data-testid="live-list-panel"]')
    expect(panel.find('#t').exists() && panel.find('#l').exists() && panel.find('#f').exists()).toBe(true)
    expect(panel.find('#d').exists()).toBe(false)
    expect(wrapper.find('#d').exists()).toBe(true)
    expect(wrapper.find('[role="separator"]').exists()).toBe(true)
  })

  it('has no tooltip over the drag handle', () => {
    const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws' } })
    expect(wrapper.find('[role="separator"]').attributes('title')).toBeUndefined()
  })

  it('lets the list and the detail scroll on their own', () => {
    const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws' }, slots: { list: '<i id="l"/>', detail: '<i id="d"/>' } })
    expect(wrapper.find('#l').element.parentElement?.className).toContain('overflow-y-auto')
    expect(wrapper.find('#d').element.parentElement?.className).toContain('overflow-y-auto')
  })

  it('lays the detail content out in a column inside padding, so a tall form never sits flush on the pinned bar', () => {
    const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws' }, slots: { detail: '<i id="d"/>' } })
    const scroller = wrapper.find('#d').element.parentElement!

    expect(scroller.className).toContain('flex-col')
    expect(scroller.className).toContain('p-6')
    expect(scroller.className).toContain('gap-4')
  })

  it('shows the pinned action area only when one is provided', () => {
    const without = mount(LiveWorkspace, { props: { storageKey: 'test:ws' } })
    expect(without.find('[data-testid="live-detail-footer"]').exists()).toBe(false)
    const withBar = mount(LiveWorkspace, { props: { storageKey: 'test:ws' }, slots: { 'detail-footer': '<b/>' } })
    expect(withBar.find('[data-testid="live-detail-footer"]').exists()).toBe(true)
  })

  it('double-clicking the handle resets the saved width', async () => {
    localStorage.setItem('test:ws', '500')
    const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws' } })
    await wrapper.find('[role="separator"]').trigger('dblclick')
    expect(localStorage.getItem('test:ws')).toBe('336')
  })

  describe('loading more as the list is scrolled', () => {
    function scrollbox(wrapper: ReturnType<typeof mount>, sizes: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
      const el = wrapper.find('[data-testid="live-list-scroll"]').element as HTMLElement
      for (const [key, value] of Object.entries(sizes)) Object.defineProperty(el, key, { value, configurable: true })
      return el
    }

    it('asks for the next page when the user scrolls near the bottom', async () => {
      const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws', hasMore: true, loading: false } })
      await nextTick()
      wrapper.emitted('loadMore')
      const before = wrapper.emitted('loadMore')?.length ?? 0

      const el = scrollbox(wrapper, { scrollHeight: 2000, clientHeight: 400, scrollTop: 100 })
      await wrapper.find('[data-testid="live-list-scroll"]').trigger('scroll')
      expect(wrapper.emitted('loadMore')?.length ?? 0).toBe(before)

      Object.defineProperty(el, 'scrollTop', { value: 1500, configurable: true })
      await wrapper.find('[data-testid="live-list-scroll"]').trigger('scroll')
      expect(wrapper.emitted('loadMore')?.length ?? 0).toBe(before + 1)
    })

    it('does not ask while a page is loading or when there is nothing more', async () => {
      const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws', hasMore: true, loading: true } })
      scrollbox(wrapper, { scrollHeight: 500, clientHeight: 400, scrollTop: 100 })
      await wrapper.find('[data-testid="live-list-scroll"]').trigger('scroll')
      expect(wrapper.emitted('loadMore')).toBeUndefined()

      await wrapper.setProps({ loading: false, hasMore: false })
      await wrapper.find('[data-testid="live-list-scroll"]').trigger('scroll')
      expect(wrapper.emitted('loadMore')).toBeUndefined()
    })

    it('keeps loading until a short list fills the panel, so a tall window is never left half empty', async () => {
      const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws', hasMore: true, loading: true } })
      scrollbox(wrapper, { scrollHeight: 300, clientHeight: 800, scrollTop: 0 })
      await wrapper.setProps({ loading: false })
      await nextTick()
      expect(wrapper.emitted('loadMore')).toHaveLength(1)
    })
  })
})
