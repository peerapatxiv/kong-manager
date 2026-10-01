<script setup lang="ts">
import AppIcon from '../components/shared/AppIcon.vue'
import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { diffKongConfigs, hasDiff } from '../lib/diff'
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

// Same filename doesn't strictly mean identical content (in-app edits can
// diverge File A from disk), but it's the single most common way someone
// accidentally compares a file against itself — worth a heads-up either way.
const sameFileName = computed(
  () =>
    !!configStore.compareTarget &&
    configStore.compareTarget.fileName === configStore.primary?.fileName,
)

const changedRoutesByService = computed(() => {
  if (!diff.value) return []
  return [...diff.value.routesByService].filter(([, routeDiff]) => hasDiff(routeDiff))
})

const anyDiff = computed(() => {
  if (!diff.value) return false
  return (
    hasDiff(diff.value.services) ||
    hasDiff(diff.value.consumers) ||
    hasDiff(diff.value.globalPlugins) ||
    changedRoutesByService.value.length > 0
  )
})
</script>

<template>
  <div class="space-y-6 p-4 sm:p-8">
    <div class="card space-y-1.5 p-4 text-sm text-ink-muted">
      <p>
        File A: <span class="font-mono text-ink">{{ configStore.primary?.fileName }}</span> (currently
        loaded, including in-app edits)
      </p>
      <p v-if="configStore.compareTarget">
        File B: <span class="font-mono text-ink">{{ configStore.compareTarget.fileName }}</span>
      </p>
      <p v-if="sameFileName" class="flex items-center gap-1.5 text-amber-700">
        <AppIcon name="warning" class="h-3.5 w-3.5 shrink-0" />
        Both files are named "{{ configStore.compareTarget?.fileName }}" — make sure File B is the one you meant
        to compare against.
      </p>
    </div>

    <FileDropZone label="Load File B to compare against" @file-selected="onFileSelected" />

    <div v-if="errorMessage" class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800">
      Failed to parse YAML: {{ errorMessage }}
    </div>

    <template v-if="diff">
      <DiffSummary :diff="diff" />

      <div v-if="!anyDiff" class="card flex items-center gap-3 p-5">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-secondary">
          <AppIcon name="check" class="h-4 w-4" />
        </span>
        <div>
          <p class="font-bold text-ink">No differences found</p>
          <p class="text-sm text-ink-muted">Every service, consumer, global plugin, and route matches between the two files.</p>
        </div>
      </div>

      <template v-else>
        <DiffEntityList
          v-if="hasDiff(diff.services)"
          title="Services"
          :diff="diff.services"
          :entity-label="(s) => s.name ?? '(unnamed)'"
        />
        <DiffEntityList
          v-if="hasDiff(diff.consumers)"
          title="Consumers"
          :diff="diff.consumers"
          :entity-label="(c) => c.username ?? '(unnamed)'"
        />
        <DiffEntityList
          v-if="hasDiff(diff.globalPlugins)"
          title="Global Plugins"
          :diff="diff.globalPlugins"
          :entity-label="(p) => p.name"
        />
        <DiffEntityList
          v-for="[serviceName, routeDiff] in changedRoutesByService"
          :key="serviceName"
          :title="`Routes — ${serviceName}`"
          :diff="routeDiff"
          :entity-label="(r) => r.name ?? '(unnamed)'"
        />
      </template>
    </template>
  </div>
</template>
