<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import ExportModal from '../ExportModal.vue'

const configStore = useConfigStore()
const exportModalOpen = ref(false)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-slate-200 bg-white px-4 py-3 flex items-center gap-6">
      <span class="font-semibold text-slate-800">Kong Config Viewer</span>
      <nav class="flex gap-4 text-sm">
        <RouterLink to="/" class="text-slate-600 hover:text-slate-900" active-class="text-slate-900 font-medium">
          Load
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/browse"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Browse
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/compare"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Compare
        </RouterLink>
      </nav>
      <div class="ml-auto">
        <button
          v-if="configStore.isLoaded"
          type="button"
          class="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
          @click="exportModalOpen = true"
        >
          Generate new config
        </button>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <ExportModal :open="exportModalOpen" @close="exportModalOpen = false" />
  </div>
</template>
