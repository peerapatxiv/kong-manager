// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import BrowseView from './BrowseView.vue'
import { useConfigStore } from '../stores/config'

const PANEL_WIDTH_KEY = 'kong-config:browse-panel-width'

function stubDesktop(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('BrowseView responsive layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useConfigStore().loadPrimary('sample.yaml', '_format_version: "3.0"\n')
    localStorage.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('stacks the sidebar above the detail panel below the lg breakpoint, side-by-side at lg and up', () => {
    stubDesktop(false)
    const wrapper = mount(BrowseView)
    const layout = wrapper.get('[data-testid="browse-layout"]').classes()
    expect(layout).toContain('flex-col')
    expect(layout).toContain('lg:flex-row')

    // Below lg, the panel falls back to the plain `w-full` class — no inline
    // pixel width, so it can't force a wide layout on a narrow screen.
    const panel = wrapper.get('[data-testid="list-panel"]')
    expect(panel.classes()).toContain('w-full')
    expect((panel.element as HTMLElement).style.width).toBe('')
  })

  it('gives the panel a resizable pixel width at the lg breakpoint, defaulting to 384px', async () => {
    stubDesktop(true)
    const wrapper = mount(BrowseView)
    await wrapper.vm.$nextTick()
    const panel = wrapper.get('[data-testid="list-panel"]')
    expect((panel.element as HTMLElement).style.width).toBe('384px')
  })

  it('restores a previously-saved panel width from localStorage', async () => {
    localStorage.setItem(PANEL_WIDTH_KEY, '500')
    stubDesktop(true)
    const wrapper = mount(BrowseView)
    await wrapper.vm.$nextTick()
    const panel = wrapper.get('[data-testid="list-panel"]')
    expect((panel.element as HTMLElement).style.width).toBe('500px')
  })

  it('dragging the resize handle changes and persists the panel width, clamped to the allowed range', async () => {
    stubDesktop(true)
    const wrapper = mount(BrowseView)
    await wrapper.vm.$nextTick()
    const panel = wrapper.get('[data-testid="list-panel"]')
    const handle = wrapper.get('[role="separator"]').element

    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await wrapper.vm.$nextTick()

    expect((panel.element as HTMLElement).style.width).toBe('484px')
    expect(localStorage.getItem(PANEL_WIDTH_KEY)).toBe('484')

    // Dragging far past the max should clamp, not run away.
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 5000 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await wrapper.vm.$nextTick()

    expect((panel.element as HTMLElement).style.width).toBe('720px')
  })

  it('double-clicking the resize handle resets the panel to the default width', async () => {
    localStorage.setItem(PANEL_WIDTH_KEY, '600')
    stubDesktop(true)
    const wrapper = mount(BrowseView)
    await wrapper.vm.$nextTick()
    const panel = wrapper.get('[data-testid="list-panel"]')
    expect((panel.element as HTMLElement).style.width).toBe('600px')

    await wrapper.get('[role="separator"]').trigger('dblclick')

    expect((panel.element as HTMLElement).style.width).toBe('384px')
    expect(localStorage.getItem(PANEL_WIDTH_KEY)).toBe('384')
  })
})
