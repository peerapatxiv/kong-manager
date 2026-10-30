// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TargetHealthBadge from './TargetHealthBadge.vue'

const badge = (health?: string) => mount(TargetHealthBadge, { props: { health } })

describe('TargetHealthBadge', () => {
  it.each([
    ['HEALTHY', 'Healthy'],
    ['UNHEALTHY', 'Unhealthy'],
    ['DNS_ERROR', 'DNS error'],
    ['HEALTHCHECKS_OFF', 'Checks off'],
  ])('shows %s as the text "%s", never colour alone', (state, label) => {
    const wrapper = badge(state)
    expect(wrapper.text()).toBe(label)
    expect(wrapper.attributes('data-health')).toBe(state)
  })

  it('shows a dash for a missing or unknown state', () => {
    expect(badge(undefined).text()).toBe('–')
    expect(badge('SOMETHING_NEW').text()).toBe('–')
    expect(badge(undefined).attributes('title')).toBe('No health data')
  })
})
