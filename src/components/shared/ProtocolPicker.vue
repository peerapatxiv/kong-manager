<script setup lang="ts">
import { KONG_PROTOCOLS } from '../../types/kong'

const props = defineProps<{ modelValue: string[] | undefined; options?: readonly string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function toggle(protocol: string) {
  const current = props.modelValue ?? []
  const next = current.includes(protocol) ? current.filter((p) => p !== protocol) : [...current, protocol]
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-for="protocol in options ?? KONG_PROTOCOLS"
      :key="protocol"
      type="button"
      :aria-pressed="(modelValue ?? []).includes(protocol)"
      class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150"
      :class="
        (modelValue ?? []).includes(protocol)
          ? 'border-accent/40 bg-accent/15 text-accent-secondary'
          : 'border-border text-ink-muted hover:border-accent/40 hover:bg-elevated'
      "
      @click="toggle(protocol)"
    >
      {{ protocol }}
    </button>
  </div>
</template>
