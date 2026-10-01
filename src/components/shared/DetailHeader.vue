<script setup lang="ts">
defineProps<{ initial: string; title: string; subtitle?: string }>()
</script>

<template>
  <div class="flex items-center gap-3">
    <span
      aria-hidden="true"
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold uppercase text-accent-on"
    >
      {{ initial }}
    </span>
    <div class="min-w-0">
      <p class="truncate font-semibold text-ink">{{ title }}</p>
      <p v-if="subtitle" class="truncate font-mono text-xs text-ink-muted">{{ subtitle }}</p>
    </div>
  </div>
</template>
