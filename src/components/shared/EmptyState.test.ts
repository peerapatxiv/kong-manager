// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('shows the icon, the title, the hint and an action slot', () => {
    const wrapper = mount(EmptyState, {
      props: { icon: 'user', title: 'Select a consumer from the list, or create a new one.', hint: 'Nothing here yet' },
      slots: { default: '<button>New</button>' },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('Select a consumer from the list, or create a new one.')
    expect(wrapper.text()).toContain('Nothing here yet')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('omits the hint when there is none', () => {
    const wrapper = mount(EmptyState, { props: { icon: 'list', title: 'Empty' } })
    expect(wrapper.findAll('p')).toHaveLength(1)
  })

  it('grows to fill the space it is given, so it stays centred in a detail panel', () => {
    const wrapper = mount(EmptyState, { props: { icon: 'list', title: 'Empty' } })
    expect(wrapper.classes()).toContain('flex-1')
  })
})
