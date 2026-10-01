<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { computed, ref } from 'vue'

const COMMON_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

const props = defineProps<{ modelValue: string[] | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const draft = ref('')

const customMethods = computed(() => (props.modelValue ?? []).filter((m) => !(COMMON_METHODS as readonly string[]).includes(m)))

function toggle(method: string) {
  const current = props.modelValue ?? []
  const next = current.includes(method) ? current.filter((m) => m !== method) : [...current, method]
  emit('update:modelValue', next)
}

function removeCustom(method: string) {
  emit(
    'update:modelValue',
    (props.modelValue ?? []).filter((m) => m !== method),
  )
}

function commitDraft() {
  const value = draft.value.trim().toUpperCase()
  if (!value) return
  draft.value = ''
  if ((props.modelValue ?? []).includes(value)) return
  emit('update:modelValue', [...(props.modelValue ?? []), value])
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    commitDraft()
  }
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="method in COMMON_METHODS"
        :key="method"
        type="button"
        :aria-pressed="(modelValue ?? []).includes(method)"
        class="rounded-full border px-2.5 py-1 font-mono text-xs font-medium transition-colors duration-150"
        :class="
          (modelValue ?? []).includes(method)
            ? 'border-accent/40 bg-accent/15 text-accent-secondary'
            : 'border-border text-ink-muted hover:border-accent/40 hover:bg-elevated'
        "
        @click="toggle(method)"
      >
        {{ method }}
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        v-for="method in customMethods"
        :key="method"
        class="flex items-center gap-1 rounded-md bg-accent/15 py-0.5 pl-2 pr-1 font-mono text-xs text-accent-secondary"
      >
        {{ method }}
        <button
          type="button"
          class="rounded px-1 text-accent-secondary/70 hover:bg-accent/20 hover:text-accent-secondary"
          title="Remove"
          @click="removeCustom(method)"
        >
          ×
        </button>
      </span>
      <div
        class="flex min-w-[7rem] flex-1 items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 transition-colors duration-150 focus-within:border-accent focus-within:bg-accent/5 hover:border-accent/40"
      >
        <AppIcon name="plus" class="h-3 w-3 shrink-0 text-ink-muted" />
        <input
          v-model="draft"
          type="text"
          placeholder="custom method…"
          class="min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-muted"
          @keydown="onKeydown"
          @blur="commitDraft"
        />
      </div>
    </div>
  </div>
</template>
