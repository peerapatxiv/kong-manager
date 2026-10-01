// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import SidebarLink from './SidebarLink.vue'

const make = () =>
  mount(SidebarLink, {
    props: { to: '/x', label: 'Routes', icon: 'route' },
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/x', component: { template: '<div />' } }] })] },
  })

describe('SidebarLink', () => {
  it('shows its label with an icon tile', () => {
    const wrapper = make()
    expect(wrapper.text()).toBe('Routes')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('keeps the icon tile visible, in a darker shade, when the row is hovered or focused', () => {
    // The hovered row and the idle tile share a colour, so without this the tile vanishes.
    const tile = make().find('svg').element.parentElement!
    expect(tile.className).toContain('group-hover:bg-surface')
    expect(tile.className).toContain('group-focus-visible:bg-surface')
  })

  it('turns the tile solid accent colour for the current page', () => {
    const tile = make().find('svg').element.parentElement!
    expect(tile.className).toContain('group-[.is-active]:bg-accent')
  })
})
