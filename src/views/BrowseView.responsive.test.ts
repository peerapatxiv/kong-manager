// @vitest-environment jsdom
// jsdom doesn't evaluate media queries, so this can only assert the Tailwind
// `lg:` responsive classes the spec's breakpoint requires are present — not
// that the layout actually renders correctly at each width (needs a real
// browser for that).
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import BrowseView from './BrowseView.vue'
import { useConfigStore } from '../stores/config'

describe('BrowseView responsive layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useConfigStore().loadPrimary('sample.yaml', '_format_version: "3.0"\n')
  })

  it('stacks the sidebar above the detail panel below the lg breakpoint, side-by-side at lg and up', () => {
    const wrapper = mount(BrowseView)
    const root = wrapper.find('.flex').classes()
    expect(root).toContain('flex-col')
    expect(root).toContain('lg:flex-row')

    const sidebar = wrapper.findAll('div')[1].classes()
    expect(sidebar).toContain('w-full')
    expect(sidebar).toContain('lg:w-72')
  })
})
