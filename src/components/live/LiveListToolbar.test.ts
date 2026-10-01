// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveListToolbar from './LiveListToolbar.vue'

const base = { placeholder: 'Search loaded services…', newTestid: 'new-service', noun: 'service', count: 3, loading: false, canCreate: true }

describe('LiveListToolbar', () => {
  it('shows the search box, a New button with the given test id, and a tag filter', () => {
    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '', tags: '' } })
    expect(wrapper.find('input[placeholder="Search loaded services…"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="new-service"]').text()).toBe('New')
    expect(wrapper.find('[data-testid="tag-filter"]').exists()).toBe(true)
  })

  it('counts what is loaded, in the singular and the plural', async () => {
    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '', tags: '' } })
    expect(wrapper.text()).toContain('3 services')
    await wrapper.setProps({ count: 1 })
    expect(wrapper.text()).toContain('1 service')
    expect(wrapper.text()).not.toContain('1 services')
  })

  it('says it is loading while a request is in flight', () => {
    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '', tags: '', loading: true } })
    expect(wrapper.find('[data-testid="list-loading"]').exists()).toBe(true)
  })

  it('disables New when writes are not allowed, and emits create / applyTags otherwise', async () => {
    const readOnly = mount(LiveListToolbar, { props: { ...base, search: '', tags: '', canCreate: false } })
    expect(readOnly.find('[data-testid="new-service"]').attributes('disabled')).toBeDefined()

    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '', tags: 'a,b' } })
    await wrapper.find('[data-testid="new-service"]').trigger('click')
    await wrapper.find('[data-testid="tag-filter"]').trigger('keydown.enter')
    expect(wrapper.emitted('create')).toHaveLength(1)
    expect(wrapper.emitted('applyTags')).toHaveLength(1)
  })

  it('updates the search and tag models as the user types', async () => {
    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '', tags: '' } })
    await wrapper.find('[data-testid="tag-filter"]').setValue('x')
    expect(wrapper.emitted('update:tags')?.[0]).toEqual(['x'])
  })

  it('renders extra filters from the default slot', () => {
    const wrapper = mount(LiveListToolbar, {
      props: { ...base, search: '', tags: '' },
      slots: { default: '<select data-testid="extra" />' },
    })
    expect(wrapper.find('[data-testid="extra"]').exists()).toBe(true)
  })
})
