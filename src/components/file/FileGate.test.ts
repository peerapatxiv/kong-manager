// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import FileGate from './FileGate.vue'
import { useConfigStore } from '../../stores/config'

const make = () =>
  mount(FileGate, {
    slots: { default: '<div data-testid="inside">page</div>' },
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })] },
  })

beforeEach(() => setActivePinia(createPinia()))

describe('FileGate', () => {
  it('asks for a file, with a way back to the Overview page, when none is loaded', () => {
    const wrapper = make()
    expect(wrapper.find('[data-testid="file-not-loaded"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="inside"]').exists()).toBe(false)
    expect(wrapper.find('a').attributes('href')).toBe('/')
  })

  it('shows the page once a file is loaded', () => {
    useConfigStore().loadPrimary('a.yaml', '_format_version: "3.0"\n')
    const wrapper = make()
    expect(wrapper.find('[data-testid="inside"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="file-not-loaded"]').exists()).toBe(false)
  })
})
