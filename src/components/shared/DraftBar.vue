<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{ dirty: boolean; justSaved: boolean }>()
const emit = defineEmits<{ save: []; discard: [] }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span
      v-if="justSaved"
      class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-secondary dark:bg-accent/20 dark:text-accent"
    >
      <AppIcon name="check" class="h-3 w-3" />
      Saved
    </span>
    <span v-else-if="dirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
      <span class="h-1.5 w-1.5 rounded-full bg-accent" />
      Unsaved changes
    </span>
    <div class="ml-auto flex gap-2">
      <button type="button" class="btn-secondary" :disabled="!dirty" @click="emit('discard')">Discard</button>
      <button type="button" class="btn-primary" :disabled="!dirty" @click="emit('save')">Save</button>
    </div>
  </div>
</template>
