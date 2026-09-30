// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import LiveGate from './LiveGate.vue'
import { useConnectionStore } from '../../stores/connection'

function mountGate() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  return mount(LiveGate, { global: { plugins: [router] }, slots: { default: '<p data-testid="content">content</p>' } })
}

beforeEach(() => setActivePinia(createPinia()))

describe('LiveGate', () => {
  it('shows a connect prompt with a link to Load, and no content, when not connected', () => {
    const wrapper = mountGate()

    expect(wrapper.find('[data-testid="live-not-connected"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(false)
    expect(wrapper.find('a').attributes('href')).toBe('/')
  })

  it('shows the content without a notice when connected to a database-backed Kong', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mountGate()

    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="live-read-only"]').exists()).toBe(false)
  })

  it('shows the content plus a read-only notice on DB-less Kong', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'off' } })
    const wrapper = mountGate()

    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="live-read-only"]').text()).toMatch(/read-only/i)
  })
})
