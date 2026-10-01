<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ rows: { label: string; count: number }[]; emptyText: string }>()

const max = computed(() => Math.max(1, ...props.rows.map((row) => row.count)))
</script>

<template>
  <ul v-if="rows.length > 0" class="space-y-3">
    <li v-for="row in rows" :key="row.label">
      <div class="flex items-center justify-between gap-3 text-xs">
        <span class="truncate font-mono text-ink" :title="row.label">{{ row.label }}</span>
        <span class="shrink-0 font-semibold tabular-nums text-ink-muted">{{ row.count }}</span>
      </div>
      <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
        <div class="h-full rounded-full bg-accent transition-all duration-300" :style="{ width: `${(row.count / max) * 100}%` }" />
      </div>
    </li>
  </ul>
  <p v-else class="text-sm text-ink-muted">{{ emptyText }}</p>
</template>
