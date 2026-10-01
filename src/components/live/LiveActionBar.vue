<script setup lang="ts">
defineProps<{ creating: boolean; dirty: boolean; canSave: boolean; canWrite: boolean; busy: boolean }>()
const emit = defineEmits<{ delete: []; discard: []; save: [] }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <button
      v-if="!creating"
      type="button"
      class="btn-danger-ghost"
      data-testid="delete"
      :disabled="!canWrite || busy"
      @click="emit('delete')"
    >
      Delete
    </button>
    <span v-if="dirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
      <span class="h-1.5 w-1.5 rounded-full bg-accent" />
      Unsaved changes
    </span>
    <div class="ml-auto flex gap-2">
      <button type="button" class="btn-secondary" data-testid="discard" :disabled="!dirty" @click="emit('discard')">
        Discard
      </button>
      <button type="button" class="btn-primary" data-testid="save" :disabled="!canSave" @click="emit('save')">
        {{ creating ? 'Create' : 'Save' }}
      </button>
    </div>
  </div>
</template>
