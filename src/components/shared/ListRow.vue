<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ selected?: boolean; showCheck?: boolean; initial?: string }>(), {
  selected: false,
  showCheck: false,
  initial: undefined,
})
</script>

<template>
  <li
    class="flex cursor-pointer items-center gap-2 rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
    :class="
      selected
        ? 'border-accent bg-accent/10 font-medium text-link'
        : 'border-transparent text-ink-muted hover:bg-elevated'
    "
  >
    <span
      v-if="initial !== undefined"
      aria-hidden="true"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase"
      :class="selected ? 'bg-accent text-accent-on' : 'bg-elevated text-ink-muted'"
    >
      {{ initial }}
    </span>
    <span class="min-w-0 flex-1 truncate font-mono"><slot /></span>
    <slot name="trail" />
    <AppIcon v-if="showCheck && selected" name="check" class="h-3.5 w-3.5 shrink-0 text-accent-secondary" />
  </li>
</template>
