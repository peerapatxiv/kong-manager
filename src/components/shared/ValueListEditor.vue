<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: string[] | undefined; placeholder?: string; addLabel?: string; monospace?: boolean }>(),
  {
    placeholder: 'add value…',
    addLabel: 'Add',
    monospace: true,
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const draft = ref('')

function setAt(index: number, raw: string) {
  const value = raw.trim()
  const next = [...(props.modelValue ?? [])]
  if (value) next[index] = value
  else next.splice(index, 1)
  emit('update:modelValue', next)
}

function removeAt(index: number) {
  const next = [...(props.modelValue ?? [])]
  next.splice(index, 1)
  emit('update:modelValue', next)
}

function commitDraft() {
  const value = draft.value.trim()
  if (!value) return
  draft.value = ''
  emit('update:modelValue', [...(props.modelValue ?? []), value])
}

function onRowKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
}
</script>

<template>
  <div class="space-y-1.5">
    <div v-for="(value, index) in modelValue ?? []" :key="index" class="flex items-center gap-1.5">
      <input
        type="text"
        :value="value"
        spellcheck="false"
        class="input-field min-w-0 flex-1 !py-1.5 text-xs"
        :class="monospace ? 'font-mono' : ''"
        @change="setAt(index, ($event.target as HTMLInputElement).value)"
        @keydown="onRowKeydown"
      />
      <button
        type="button"
        title="Remove"
        aria-label="Remove"
        class="shrink-0 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        @click="removeAt(index)"
      >
        ×
      </button>
    </div>
    <div class="flex items-center gap-1.5">
      <input
        v-model="draft"
        type="text"
        :placeholder="`${addLabel}: ${placeholder}`"
        spellcheck="false"
        class="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-transparent px-3 py-1.5 text-xs text-ink outline-none transition-colors placeholder:text-ink-muted hover:border-accent/40 focus:border-accent focus:bg-accent/5"
        :class="monospace ? 'font-mono' : ''"
        @keydown.enter.prevent="commitDraft"
        @blur="commitDraft"
      />
      <button
        type="button"
        class="btn-secondary shrink-0 !px-2.5 !py-1.5 text-xs"
        :disabled="!draft.trim()"
        @mousedown.prevent
        @click="commitDraft"
      >
        Add
      </button>
    </div>
  </div>
</template>
