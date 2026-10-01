import { computed, onMounted, onUnmounted, ref } from 'vue'

export type ResizablePanelOptions = {
  /** localStorage key that remembers the width across reloads. */
  storageKey: string
  defaultWidth: number
  min: number
  max: number
}

/**
 * A list panel whose width the user drags (handle on its right edge), clamped to a range
 * and remembered. The width only applies from the `lg` breakpoint up; below it the panel
 * stacks full width, so `panelStyle` is empty there.
 */
export function useResizablePanel({ storageKey, defaultWidth, min, max }: ResizablePanelOptions) {
  const clamp = (width: number) => Math.min(max, Math.max(min, width))

  function loadStored(): number {
    const stored = Number(localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : defaultWidth
  }

  const panelWidth = ref(loadStored())
  const isDesktop = ref(false)
  const isResizing = ref(false)
  const panelStyle = computed(() => (isDesktop.value ? { width: `${panelWidth.value}px` } : {}))

  let desktopQuery: MediaQueryList | undefined
  const syncIsDesktop = () => {
    isDesktop.value = desktopQuery?.matches ?? false
  }

  onMounted(() => {
    if (typeof window.matchMedia !== 'function') return
    desktopQuery = window.matchMedia('(min-width: 1024px)')
    syncIsDesktop()
    desktopQuery.addEventListener('change', syncIsDesktop)
  })
  onUnmounted(() => desktopQuery?.removeEventListener('change', syncIsDesktop))

  let startX = 0
  let startWidth = 0

  function onMove(event: PointerEvent) {
    panelWidth.value = clamp(startWidth + (event.clientX - startX))
  }

  function stopResize() {
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', onMove)
    localStorage.setItem(storageKey, String(panelWidth.value))
  }

  function startResize(event: PointerEvent) {
    isResizing.value = true
    startX = event.clientX
    startWidth = panelWidth.value
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stopResize, { once: true })
  }

  function resetPanelWidth() {
    panelWidth.value = defaultWidth
    localStorage.setItem(storageKey, String(defaultWidth))
  }

  return { panelWidth, panelStyle, isResizing, startResize, resetPanelWidth }
}
