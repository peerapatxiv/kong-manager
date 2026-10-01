// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from './AppIcon.vue'

describe('AppIcon', () => {
  it('draws a 20x20 stroke icon that takes its colour and size from the caller', () => {
    const wrapper = mount(AppIcon, { props: { name: 'user' }, attrs: { class: 'h-4 w-4' } })
    const svg = wrapper.find('svg')

    expect(svg.attributes('viewBox')).toBe('0 0 20 20')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('stroke-width')).toBe('1.5')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.classes()).toEqual(expect.arrayContaining(['h-4', 'w-4']))
    expect(svg.findAll('path').length).toBeGreaterThan(0)
  })

  it('renders every named icon with at least one path', () => {
    const names = [
      'home', 'list', 'compare', 'server', 'route', 'user', 'plug', 'link', 'upload', 'trash',
      'eye', 'eye-off', 'search', 'x', 'plus', 'check', 'chevron-right', 'menu', 'moon', 'lock', 'warning',
    ] as const
    for (const name of names) {
      expect(mount(AppIcon, { props: { name } }).findAll('path').length, name).toBeGreaterThan(0)
    }
  })

  it('renders nothing for an unknown name instead of throwing', () => {
    const wrapper = mount(AppIcon, { props: { name: 'nope' as never } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })
})
