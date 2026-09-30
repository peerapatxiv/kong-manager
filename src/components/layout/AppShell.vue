<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import AppSidebar from './AppSidebar.vue'
import ExportModal from '../ExportModal.vue'
import PushToKongModal from '../PushToKongModal.vue'

const configStore = useConfigStore()
const route = useRoute()
const exportModalOpen = ref(false)
const pushModalOpen = ref(false)
const mobileNavOpen = ref(false)

const pageTitle = computed(() => {
  if (route.path === '/browse') return 'Browse'
  if (route.path === '/compare') return 'Compare'
  if (route.path === '/live/services') return 'Live services'
  if (route.path === '/live/routes') return 'Live routes'
  return 'Load config'
})
</script>

<template>
  <div class="flex h-screen bg-bg">
    <div
      v-if="mobileNavOpen"
      class="fixed inset-0 z-30 bg-black/50 md:hidden"
      @click="mobileNavOpen = false"
    />
    <div
      class="fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0"
      :class="mobileNavOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <AppSidebar @navigate="mobileNavOpen = false" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-3 border-b border-border bg-surface px-4 py-4 md:px-6">
        <button
          type="button"
          aria-label="Open navigation"
          class="-ml-1 rounded-lg p-1.5 text-ink-muted hover:bg-elevated md:hidden"
          @click="mobileNavOpen = true"
        >
          <svg viewBox="0 0 20 20" fill="none" class="h-5 w-5">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <h1 class="text-lg font-bold text-ink">{{ pageTitle }}</h1>
        <div class="ml-auto flex gap-2">
          <button v-if="configStore.isLoaded" type="button" class="btn-secondary" @click="pushModalOpen = true">
            Push to Kong
          </button>
          <button v-if="configStore.isLoaded" type="button" class="btn-primary" @click="exportModalOpen = true">
            Generate new config
          </button>
        </div>
      </header>
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <ExportModal :open="exportModalOpen" @close="exportModalOpen = false" />
    <PushToKongModal :open="pushModalOpen" @close="pushModalOpen = false" />
  </div>
</template>
