<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ health?: string }>()

const STATES: Record<string, { label: string; dot: string; chip: string }> = {
  HEALTHY: { label: 'Healthy', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  UNHEALTHY: { label: 'Unhealthy', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  DNS_ERROR: { label: 'DNS error', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  HEALTHCHECKS_OFF: { label: 'Checks off', dot: 'bg-ink-muted', chip: 'bg-elevated text-ink-muted' },
}

const state = computed(() => (props.health ? STATES[props.health] : undefined))
</script>

<template>
  <span
    data-testid="target-health"
    :data-health="health"
    :title="state ? undefined : 'No health data'"
    class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="state ? state.chip : 'text-ink-muted'"
  >
    <span v-if="state" class="h-1.5 w-1.5 rounded-full" :class="state.dot" />
    {{ state ? state.label : '–' }}
  </span>
</template>
