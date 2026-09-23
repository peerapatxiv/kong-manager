<script setup lang="ts">
import { computed } from 'vue'
import type { KongConfigDiff } from '../../lib/diff'

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
  <div class="flex gap-4 text-sm">
    <span class="text-emerald-700">+{{ totals.added }} added</span>
    <span class="text-red-700">-{{ totals.removed }} removed</span>
    <span class="text-blue-700">~{{ totals.changed }} changed</span>
  </div>
</template>
