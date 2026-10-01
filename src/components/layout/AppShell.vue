<script setup lang="ts">
import AppIcon from '../shared/AppIcon.vue'
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import AppSidebar from './AppSidebar.vue'
import ExportModal from '../ExportModal.vue'

const configStore = useConfigStore()
const route = useRoute()
const exportModalOpen = ref(false)
const mobileNavOpen = ref(false)

const pageTitle = computed(() => {
  if (route.path === '/file/dashboard') return 'File dashboard'
  if (route.path === '/file/services') return 'File services'
  if (route.path === '/file/routes') return 'File routes'
  if (route.path === '/file/consumers') return 'File consumers'
  if (route.path === '/file/plugins') return 'File plugins'
  if (route.path === '/compare') return 'Compare'
  if (route.path === '/live/services') return 'Live services'
  if (route.path === '/live/routes') return 'Live routes'
  if (route.path === '/live/plugins') return 'Live plugins'
  if (route.path === '/live/consumers') return 'Live consumers'
  return 'Overview'
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
          <AppIcon name="menu" class="h-5 w-5" />
        </button>
        <h1 class="text-lg font-bold text-ink">{{ pageTitle }}</h1>
        <div class="ml-auto flex gap-2">
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
  </div>
</template>
