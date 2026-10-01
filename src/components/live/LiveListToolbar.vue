<script setup lang="ts">
import SearchInput from '../shared/SearchInput.vue'

const props = defineProps<{
  placeholder: string
  newTestid: string
  noun: string
  count: number
  loading: boolean
  canCreate: boolean
  search: string
  tags: string
}>()
const emit = defineEmits<{
  'update:search': [value: string]
  'update:tags': [value: string]
  create: []
  applyTags: []
}>()

function plural(): string {
  return props.count === 1 ? props.noun : `${props.noun}s`
}
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
    <input
      :value="tags"
      type="text"
      class="input-field text-xs"
      data-testid="tag-filter"
      placeholder="Filter by tags (comma separated), Enter to apply"
      @input="emit('update:tags', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="emit('applyTags')"
    />
    <p class="flex items-center gap-1.5 px-0.5 text-[11px] text-ink-muted">
      <span
        v-if="loading"
        data-testid="list-loading"
        class="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <span class="tabular-nums">{{ count }} {{ plural() }}</span>
    </p>
  </div>
</template>
