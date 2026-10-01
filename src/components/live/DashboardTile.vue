<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from '../shared/AppIcon.vue'
import type { IconName } from '../shared/AppIcon.vue'
import type { Section } from '../../composables/useLiveDashboard'

defineProps<{
  label: string
  icon: IconName
  /** A list that loads (with its own loading and error state)... */
  section?: Section<unknown[]>
  /** ...or a plain number that is already known. */
  count?: number
  to?: string
}>()
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    v-bind="to ? { to } : {}"
    class="card group flex items-center gap-3.5 p-4 transition duration-150"
    :class="to ? 'cursor-pointer hover:border-accent hover:shadow-md' : ''"
  >
    <span
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-secondary transition-colors duration-150"
      :class="to ? 'group-hover:bg-accent group-hover:text-accent-on' : ''"
    >
      <AppIcon :name="icon" class="h-5 w-5" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-sm text-ink-muted">{{ label }}</p>
      <div v-if="count === undefined && section?.loading && section.data === null" class="mt-1 h-7 w-14 animate-pulse rounded-md bg-elevated" />
      <p v-else-if="count === undefined && section?.error" class="mt-0.5 text-xs leading-snug text-red-600 dark:text-red-400">
        Couldn't load: {{ section?.error }}
      </p>
      <p v-else class="text-2xl font-bold leading-tight tabular-nums text-ink">{{ count ?? section?.data?.length ?? 0 }}</p>
    </div>
    <AppIcon v-if="to" name="chevron-right" class="h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-link" />
  </component>
</template>
