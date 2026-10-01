<script setup lang="ts">
import { computed } from 'vue'
import type { ServiceSummary } from '../../lib/live/dashboard'

const props = defineProps<{ summary: ServiceSummary }>()

const enabledPercent = computed(() => (props.summary.total > 0 ? (props.summary.enabled / props.summary.total) * 100 : 0))
</script>

<template>
  <div class="space-y-3">
    <div class="flex h-2.5 overflow-hidden rounded-full bg-elevated">
      <div
        data-testid="enabled-fill"
        class="h-full bg-accent transition-all duration-300"
        :style="{ width: `${enabledPercent}%` }"
      />
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-accent" />
        {{ summary.enabled }} enabled
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-ink-muted/40" />
        {{ summary.disabled }} disabled
      </span>
    </div>
  </div>
</template>
