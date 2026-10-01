// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useResizablePanel } from './useResizablePanel'

const OPTIONS = { storageKey: 'test:panel-width', defaultWidth: 384, min: 260, max: 720 }

function setup() {
  const Host = defineComponent({
    setup() {
      return useResizablePanel(OPTIONS)
    },
    render: () => h('div'),
  })
  return mount(Host)
}

function drag(from: number, to: number, panel: ReturnType<typeof setup>) {
  panel.vm.startResize(new MouseEvent('pointerdown', { clientX: from }) as PointerEvent)
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: to }))
  window.dispatchEvent(new MouseEvent('pointerup', { clientX: to }))
}

describe('useResizablePanel', () => {
  beforeEach(() => localStorage.clear())

  it('starts at the default width', () => {
    expect(setup().vm.panelWidth).toBe(384)
  })

  it('restores a stored width, clamped into range', () => {
    localStorage.setItem(OPTIONS.storageKey, '9999')
    expect(setup().vm.panelWidth).toBe(720)
    localStorage.setItem(OPTIONS.storageKey, '10')
    expect(setup().vm.panelWidth).toBe(260)
  })

  it('ignores a stored value that is not a number', () => {
    localStorage.setItem(OPTIONS.storageKey, 'wide')
    expect(setup().vm.panelWidth).toBe(384)
  })

  it('follows the pointer while dragging, never leaves the limits, and remembers the result', () => {
    const panel = setup()
    drag(400, 500, panel)
    expect(panel.vm.panelWidth).toBe(484)
    expect(localStorage.getItem(OPTIONS.storageKey)).toBe('484')

    drag(400, 5000, panel)
    expect(panel.vm.panelWidth).toBe(720)
    drag(400, -5000, panel)
    expect(panel.vm.panelWidth).toBe(260)
    expect(panel.vm.isResizing).toBe(false)
  })

  it('resets to the default width and remembers that too', () => {
    const panel = setup()
    drag(400, 500, panel)
    panel.vm.resetPanelWidth()
    expect(panel.vm.panelWidth).toBe(384)
    expect(localStorage.getItem(OPTIONS.storageKey)).toBe('384')
  })

  it('only applies the width as an inline style on a desktop-sized window', () => {
    const panel = setup()
    expect(panel.vm.panelStyle).toEqual({})
  })
})
