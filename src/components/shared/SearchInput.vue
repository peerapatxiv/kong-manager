<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{ modelValue: string; placeholder: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const inputRef = ref<HTMLInputElement | null>(null)
const focused = ref(false)

function clear() {
  emit('update:modelValue', '')
  inputRef.value?.focus()
}

// "/" focuses search, like Linear/GitHub — but only when the user isn't already
// typing somewhere else (another field, or this same input).
function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== '/') return
  const target = event.target as HTMLElement
  const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  if (isTyping) return
  event.preventDefault()
  inputRef.value?.focus()
}

onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <div class="relative">
    <AppIcon name="search" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />

    <input
      ref="inputRef"
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      class="input-field pl-8"
      :class="modelValue ? 'pr-8' : 'pr-9'"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="focused = true"
      @blur="focused = false"
    />

    <button
      v-if="modelValue"
      type="button"
      aria-label="Clear search"
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded text-ink-muted hover:text-ink"
      @click="clear"
    >
      <AppIcon name="x" class="h-4 w-4" />
    </button>
    <kbd
      v-else-if="!focused"
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
    >
      /
    </kbd>
  </div>
</template>
