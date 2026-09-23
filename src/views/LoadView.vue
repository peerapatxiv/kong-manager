<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '../components/FileDropZone.vue'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
const router = useRouter()
const errorMessage = ref<string | null>(null)

function onFileSelected({ fileName, text }: { fileName: string; text: string }) {
  try {
    configStore.loadPrimary(fileName, text)
    errorMessage.value = null
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto space-y-4">
    <h1 class="text-lg font-semibold">Load a Kong declarative config</h1>

    <FileDropZone label="Load your kong-config.yaml" @file-selected="onFileSelected" />

    <div v-if="errorMessage" class="border border-red-300 bg-red-50 text-red-800 rounded p-3 text-sm">
      Failed to parse YAML: {{ errorMessage }}
    </div>

    <div v-if="configStore.isLoaded" class="border border-slate-200 rounded-lg p-4 bg-white space-y-2">
      <h2 class="font-medium text-slate-800">Loaded: {{ configStore.primary?.fileName }}</h2>
      <ul class="text-sm text-slate-600 grid grid-cols-2 gap-1">
        <li>Services: {{ configStore.summary.services }}</li>
        <li>Routes: {{ configStore.summary.routes }}</li>
        <li>Consumers: {{ configStore.summary.consumers }}</li>
        <li>Global plugins: {{ configStore.summary.globalPlugins }}</li>
      </ul>
      <button
        class="mt-2 px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
        @click="router.push('/browse')"
      >
        Browse this config
      </button>
    </div>
  </div>
</template>
