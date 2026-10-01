<script lang="ts">
export type ToggleOption<T extends string | number = string | number> = { value: T; label: string }
</script>

<script setup lang="ts" generic="T extends string | number">
const props = defineProps<{
  modelValue: T
  options: ToggleOption<T>[]
  ariaLabel?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()

function choose(value: T) {
  if (props.disabled || value === props.modelValue) return
  emit('update:modelValue', value)
}

function onKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  event.preventDefault()
  const next = props.options[index + step]
  if (next) choose(next.value)
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ariaLabel"
    :data-value="String(modelValue)"
    class="inline-flex items-stretch gap-0.5 rounded-lg border border-border bg-elevated/60 p-0.5"
  >
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      :tabindex="option.value === modelValue ? 0 : -1"
      :data-value="option.value"
      :disabled="disabled"
      class="rounded-md px-3 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
      :class="
        option.value === modelValue
          ? 'bg-surface text-link shadow-sm ring-1 ring-accent/40'
          : 'text-ink-muted hover:text-ink'
      "
      @click="choose(option.value)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
