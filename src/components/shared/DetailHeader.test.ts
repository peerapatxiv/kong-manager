// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailHeader from './DetailHeader.vue'

describe('DetailHeader', () => {
  it('shows the avatar initial, the title and the subtitle', () => {
    const wrapper = mount(DetailHeader, { props: { initial: 'k', title: 'kong-admin', subtitle: 'abc-123' } })
    expect(wrapper.text()).toContain('k')
    expect(wrapper.text()).toContain('kong-admin')
    expect(wrapper.text()).toContain('abc-123')
  })

  it('omits the subtitle line when there is none', () => {
    const wrapper = mount(DetailHeader, { props: { initial: '+', title: 'New consumer' } })
    expect(wrapper.findAll('p')).toHaveLength(1)
  })
})
