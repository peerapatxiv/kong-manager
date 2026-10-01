// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import FileDashboardView from './FileDashboardView.vue'
import { useConfigStore } from '../../stores/config'
import { SAMPLE } from './sample'

const make = () =>
  mount(FileDashboardView, {
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })] },
  })

beforeEach(() => setActivePinia(createPinia()))

describe('FileDashboardView', () => {
  it('asks for a file when none is loaded', () => {
    const wrapper = make()
    expect(wrapper.find('[data-testid="file-not-loaded"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="file-dashboard"]').exists()).toBe(false)
  })

  it('shows the dashboard of the loaded file', () => {
    useConfigStore().loadPrimary('sample.yaml', SAMPLE)
    const wrapper = make()
    expect(wrapper.find('[data-testid="file-dashboard"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('sample.yaml')
  })
})
