// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import DashboardTile from './DashboardTile.vue'

const router = () =>
  createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/x', component: { template: '<div />' } }] })

describe('DashboardTile', () => {
  it('shows a plain count, with no loading or error state needed', () => {
    const wrapper = mount(DashboardTile, { props: { label: 'Services', icon: 'server', count: 17 }, global: { plugins: [router()] } })
    expect(wrapper.text()).toContain('Services')
    expect(wrapper.text()).toContain('17')
  })

  it('shows zero as a number, not as nothing', () => {
    const wrapper = mount(DashboardTile, { props: { label: 'Routes', icon: 'route', count: 0 }, global: { plugins: [router()] } })
    expect(wrapper.text()).toContain('0')
  })

  it('links to its page when given one, and is not a link otherwise', () => {
    const linked = mount(DashboardTile, { props: { label: 'A', icon: 'server', count: 1, to: '/x' }, global: { plugins: [router()] } })
    expect(linked.attributes('href')).toBe('/x')
    const plain = mount(DashboardTile, { props: { label: 'A', icon: 'server', count: 1 }, global: { plugins: [router()] } })
    expect(plain.attributes('href')).toBeUndefined()
  })

  it('still counts a loaded list when given a section', () => {
    const wrapper = mount(DashboardTile, {
      props: { label: 'A', icon: 'server', section: { data: [1, 2, 3], loading: false, error: null } },
      global: { plugins: [router()] },
    })
    expect(wrapper.text()).toContain('3')
  })
})
