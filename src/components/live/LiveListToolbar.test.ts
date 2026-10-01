// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveListToolbar from './LiveListToolbar.vue'

const base = { placeholder: 'Search loaded services…', newTestid: 'new-service', canCreate: true }

describe('LiveListToolbar', () => {
  it('shows the search box and a New button with the given test id, but no tag filter', () => {
    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '' } })
    expect(wrapper.find('input[placeholder="Search loaded services…"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="new-service"]').text()).toBe('New')
    expect(wrapper.find('[data-testid="tag-filter"]').exists()).toBe(false)
  })

  it('shows no count line under the filters', () => {
    // Even if a caller still passes the old count/loading props, nothing is rendered for them.
    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '', count: 3, noun: 'service', loading: true } as never })
    expect(wrapper.text()).not.toMatch(/\d+ services?/)
    expect(wrapper.find('[data-testid="list-loading"]').exists()).toBe(false)
  })

  it('disables New when writes are not allowed, and emits create otherwise', async () => {
    const readOnly = mount(LiveListToolbar, { props: { ...base, search: '', canCreate: false } })
    expect(readOnly.find('[data-testid="new-service"]').attributes('disabled')).toBeDefined()

    const wrapper = mount(LiveListToolbar, { props: { ...base, search: '' } })
    await wrapper.find('[data-testid="new-service"]').trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('renders extra filters from the default slot', () => {
    const wrapper = mount(LiveListToolbar, {
      props: { ...base, search: '' },
      slots: { default: '<select data-testid="extra" />' },
    })
    expect(wrapper.find('[data-testid="extra"]').exists()).toBe(true)
  })
})
