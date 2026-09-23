<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ modelValue: string[] | undefined }>()
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
  <div class="flex flex-wrap gap-1.5 items-center border border-slate-300 rounded px-2 py-1.5 bg-white">
    <span
      v-for="(tag, index) in modelValue ?? []"
      :key="`${tag}-${index}`"
      class="flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded"
    >
      {{ tag }}
      <button type="button" class="text-slate-400 hover:text-slate-700" @click="removeAt(index)">×</button>
    </span>
    <input
      v-model="draft"
      type="text"
      placeholder="add tag…"
      class="flex-1 min-w-[6rem] text-sm outline-none"
      @keydown="onKeydown"
      @blur="commitDraft"
    />
  </div>
</template>
