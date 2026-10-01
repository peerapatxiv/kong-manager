// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
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

  it('lets the list and the detail scroll on their own', () => {
    const wrapper = mount(LiveWorkspace, { props: { storageKey: 'test:ws' }, slots: { list: '<i id="l"/>', detail: '<i id="d"/>' } })
    expect(wrapper.find('#l').element.parentElement?.className).toContain('overflow-y-auto')
    expect(wrapper.find('#d').element.parentElement?.className).toContain('overflow-y-auto')
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
})
