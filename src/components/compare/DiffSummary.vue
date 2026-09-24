<script setup lang="ts">
import { computed } from 'vue'
import type { KongConfigDiff } from '../../lib/diff'
import StatTile from '../shared/StatTile.vue'

const props = defineProps<{ diff: KongConfigDiff }>()

const totals = computed(() => {
  let added = 0
  let removed = 0
  let changed = 0
  const bump = (d: { added: unknown[]; removed: unknown[]; changed: unknown[] }) => {
    added += d.added.length
    removed += d.removed.length
    changed += d.changed.length
  }
  bump(props.diff.services)
  bump(props.diff.consumers)
  bump(props.diff.globalPlugins)
  for (const routeDiff of props.diff.routesByService.values()) bump(routeDiff)
  return { added, removed, changed }
})
</script>

<template>
  <div class="grid grid-cols-3 gap-3">
    <StatTile label="Added" :value="totals.added" tone="emerald" />
    <StatTile label="Removed" :value="totals.removed" tone="red" />
    <StatTile label="Changed" :value="totals.changed" tone="blue" />
  </div>
</template>
