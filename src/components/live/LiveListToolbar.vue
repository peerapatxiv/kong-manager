<script setup lang="ts">
import SearchInput from '../shared/SearchInput.vue'

defineProps<{
  placeholder: string
  newTestid: string
  canCreate: boolean
  search: string
}>()
const emit = defineEmits<{
  'update:search': [value: string]
  create: []
}>()
</script>

<template>
  <div class="space-y-2 p-3">
    <div class="flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <SearchInput :model-value="search" :placeholder="placeholder" @update:model-value="emit('update:search', $event)" />
      </div>
      <button type="button" class="btn-primary" :data-testid="newTestid" :disabled="!canCreate" @click="emit('create')">
        New
      </button>
    </div>
    <slot />
  </div>
</template>
