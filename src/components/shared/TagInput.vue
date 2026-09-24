<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{ modelValue: string[] | undefined; placeholder?: string }>(), {
  placeholder: 'add tag…',
})
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const draft = ref('')

function commitDraft() {
  const value = draft.value.trim()
  if (!value) return
  emit('update:modelValue', [...(props.modelValue ?? []), value])
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    commitDraft()
  }
}

function removeAt(index: number) {
  const next = [...(props.modelValue ?? [])]
  next.splice(index, 1)
  emit('update:modelValue', next)
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
  >
    <span
      v-for="(tag, index) in modelValue ?? []"
      :key="`${tag}-${index}`"
      class="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent-secondary"
    >
      {{ tag }}
      <button type="button" class="text-accent-secondary/70 hover:text-accent-secondary" @click="removeAt(index)">×</button>
    </span>
    <div
      class="flex min-w-[7rem] flex-1 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 transition-colors duration-150 focus-within:border-accent focus-within:bg-accent/5 hover:border-accent/40"
    >
      <svg viewBox="0 0 16 16" fill="none" class="h-3 w-3 shrink-0 text-ink-muted">
        <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <input
        v-model="draft"
        type="text"
        :placeholder="placeholder"
        class="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
        @keydown="onKeydown"
        @blur="commitDraft"
      />
    </div>
  </div>
</template>
