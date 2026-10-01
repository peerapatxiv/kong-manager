// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ServiceStatusBar from './ServiceStatusBar.vue'

describe('ServiceStatusBar', () => {
  it('says how many services are enabled and how many are disabled', () => {
    const text = mount(ServiceStatusBar, { props: { summary: { total: 3, enabled: 2, disabled: 1 } } }).text()
    expect(text).toContain('2 enabled')
    expect(text).toContain('1 disabled')
  })

  it('fills the bar in proportion to the enabled services', () => {
    const wrapper = mount(ServiceStatusBar, { props: { summary: { total: 4, enabled: 1, disabled: 3 } } })
    expect(wrapper.find('[data-testid="enabled-fill"]').attributes('style')).toContain('width: 25%')
  })

  it('shows an empty bar rather than dividing by zero when there are no services', () => {
    const wrapper = mount(ServiceStatusBar, { props: { summary: { total: 0, enabled: 0, disabled: 0 } } })
    expect(wrapper.find('[data-testid="enabled-fill"]').attributes('style')).toContain('width: 0%')
  })
})
