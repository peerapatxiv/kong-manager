<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './AppIcon.vue'

defineProps<{ icon: IconName; title: string; hint?: string }>()
</script>

<template>
  <div class="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-center">
    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-link">
      <AppIcon :name="icon" class="h-6 w-6" />
    </span>
    <p class="text-sm text-ink-muted">{{ title }}</p>
    <p v-if="hint" class="text-xs text-ink-muted/70">{{ hint }}</p>
    <slot />
  </div>
</template>
