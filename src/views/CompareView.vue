<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { diffKongConfigs } from '../lib/diff'
import FileDropZone from '../components/FileDropZone.vue'
import DiffSummary from '../components/compare/DiffSummary.vue'
import DiffEntityList from '../components/compare/DiffEntityList.vue'

const configStore = useConfigStore()
const errorMessage = ref<string | null>(null)

function onFileSelected({ fileName, text }: { fileName: string; text: string }) {
  try {
    configStore.loadCompareTarget(fileName, text)
    errorMessage.value = null
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

const diff = computed(() => {
  if (!configStore.primary || !configStore.compareTarget) return null
  return diffKongConfigs(configStore.primary.config, configStore.compareTarget.config)
})
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-6">
    <h1 class="text-lg font-semibold">Compare</h1>

    <p class="text-sm text-slate-500">
      File A: <span class="font-mono">{{ configStore.primary?.fileName }}</span> (currently loaded, including
      in-app edits)
    </p>
    <p v-if="configStore.compareTarget" class="text-sm text-slate-500">
      File B: <span class="font-mono">{{ configStore.compareTarget.fileName }}</span>
    </p>

    <FileDropZone label="Load File B to compare against" @file-selected="onFileSelected" />

    <div v-if="errorMessage" class="border border-red-300 bg-red-50 text-red-800 rounded p-3 text-sm">
      Failed to parse YAML: {{ errorMessage }}
    </div>

    <template v-if="diff">
      <DiffSummary :diff="diff" />
      <DiffEntityList title="Services" :diff="diff.services" :entity-label="(s) => s.name ?? '(unnamed)'" />
      <DiffEntityList
        title="Consumers"
        :diff="diff.consumers"
        :entity-label="(c) => c.username ?? '(unnamed)'"
      />
      <DiffEntityList
        title="Global Plugins"
        :diff="diff.globalPlugins"
        :entity-label="(p) => p.name"
      />
      <div v-for="[serviceName, routeDiff] in diff.routesByService" :key="serviceName">
        <DiffEntityList
          :title="`Routes — ${serviceName}`"
          :diff="routeDiff"
          :entity-label="(r) => r.name ?? '(unnamed)'"
        />
      </div>
    </template>
  </div>
</template>
