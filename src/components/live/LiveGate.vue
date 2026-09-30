<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'

const connection = useConnectionStore()
</script>

<template>
  <div
    v-if="!connection.isConnected"
    class="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center"
    data-testid="live-not-connected"
  >
    <p class="text-sm text-ink-muted">Live editing needs a connection to a Kong Admin API.</p>
    <RouterLink to="/" class="btn-primary">Connect on the Load page</RouterLink>
  </div>
  <div v-else class="flex flex-1 flex-col">
    <div
      v-if="!connection.canWrite"
      role="status"
      data-testid="live-read-only"
      class="border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    >
      Kong is running without a database (DB-less), so entities are read-only here.
    </div>
    <slot />
  </div>
</template>
