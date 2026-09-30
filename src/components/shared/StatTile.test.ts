// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatTile from './StatTile.vue'

describe('StatTile', () => {
  it('shows the label above the value, without a stray colon, in the regular size', () => {
    const wrapper = mount(StatTile, { props: { label: 'Services', value: 17 } })

    expect(wrapper.text()).toContain('Services')
    expect(wrapper.text()).toContain('17')
    expect(wrapper.text()).not.toContain(':')
  })

  it('keeps the inline "Label: value" form in the compact size used by Browse', () => {
    const wrapper = mount(StatTile, { props: { label: 'Services', value: 17, compact: true } })

    expect(wrapper.text()).toMatch(/Services:\s*17/)
  })
})
