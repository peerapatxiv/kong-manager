<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ count: number }>()

const text = computed(() => {
  if (props.count === 0) return 'No routes'
  return props.count === 1 ? '1 route' : `${props.count} routes`
})
</script>

<template>
  <span
    data-testid="route-count"
    class="inline-flex items-center rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-ink-muted"
  >
    {{ text }}
  </span>
</template>
