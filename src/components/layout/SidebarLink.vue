<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppIcon from '../shared/AppIcon.vue'
import type { IconName } from '../shared/AppIcon.vue'

defineProps<{ to: string; label: string; icon: IconName }>()
const emit = defineEmits<{ navigate: [] }>()

const row = 'group flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-3 text-sm transition-colors duration-150'
const tile =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150'
</script>

<template>
  <RouterLink
    :to="to"
    :class="[
      row,
      'text-ink-muted hover:bg-elevated hover:text-ink focus-visible:bg-elevated focus-visible:outline-none',
    ]"
    active-class="is-active !bg-accent/10 !text-link font-medium"
    @click="emit('navigate')"
  >
    <span
      :class="[
        tile,
        'bg-elevated/70 text-ink-muted group-hover:text-ink group-[.is-active]:bg-accent group-[.is-active]:text-accent-on',
      ]"
    >
      <AppIcon :name="icon" class="h-4 w-4" />
    </span>
    {{ label }}
  </RouterLink>
</template>
