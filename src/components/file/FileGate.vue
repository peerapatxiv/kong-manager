<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useConfigStore } from '../../stores/config'

const configStore = useConfigStore()
</script>

<template>
  <div
    v-if="!configStore.isLoaded"
    class="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center"
    data-testid="file-not-loaded"
  >
    <p class="text-sm text-ink-muted">Load a Kong config file to browse it here.</p>
    <RouterLink to="/" class="btn-primary">Load a file on the Overview page</RouterLink>
  </div>
  <div v-else class="flex flex-1 flex-col">
    <slot />
  </div>
</template>
