<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useResizablePanel } from '../../composables/useResizablePanel'

const props = defineProps<{ storageKey: string; hasMore?: boolean; loading?: boolean }>()
const emit = defineEmits<{ loadMore: [] }>()

// The list fetches its next page by itself when scrolled near the bottom, and keeps going
// until the panel is full, so there is no "Load more" button to reach for.
const LOAD_AHEAD_PX = 160
const scrollEl = ref<HTMLElement | null>(null)

function loadMoreIfNeeded() {
  const el = scrollEl.value
  if (!el || !props.hasMore || props.loading) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_AHEAD_PX) emit('loadMore')
}

onMounted(loadMoreIfNeeded)
watch(
  () => [props.hasMore, props.loading],
  () => void nextTick(loadMoreIfNeeded),
)

// Same drag-to-resize list panel as Browse; the list and the detail scroll on their own
// so the toolbar and the action bar stay in view.
const { panelStyle, isResizing, startResize, resetPanelWidth } = useResizablePanel({
  storageKey: props.storageKey,
  defaultWidth: 336,
  min: 260,
  max: 640,
})
</script>

<template>
  <div class="flex flex-1 flex-col lg:h-[calc(100vh-4rem)] lg:flex-none lg:flex-row lg:overflow-hidden">
    <div
      class="relative flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-80 lg:border-b-0 lg:border-r"
      :style="panelStyle"
      data-testid="live-list-panel"
    >
      <div class="shrink-0"><slot name="toolbar" /></div>
      <div ref="scrollEl" data-testid="live-list-scroll" class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="loadMoreIfNeeded">
        <slot name="list" />
      </div>
      <div class="flex shrink-0 flex-col"><slot name="footer" /></div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize list panel"
        class="absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none items-center justify-center lg:flex hover:[&>span]:bg-accent/50"
        @pointerdown="startResize"
        @dblclick="resetPanelWidth"
      >
        <span
          class="h-8 w-[3px] rounded-full transition-colors duration-150"
          :class="isResizing ? 'bg-accent' : 'bg-transparent'"
        />
      </div>
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 overflow-y-auto p-6"><slot name="detail" /></div>
      <div
        v-if="$slots['detail-footer']"
        data-testid="live-detail-footer"
        class="shrink-0 border-t border-border bg-surface px-6 py-3"
      >
        <slot name="detail-footer" />
      </div>
    </div>
  </div>
</template>
