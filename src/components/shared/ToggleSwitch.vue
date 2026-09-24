<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    /** Shows an on/off status word next to the switch — skip for compact inline uses. */
    showStatus?: boolean
  }>(),
  { showStatus: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="inline-flex cursor-pointer items-center gap-2">
    <span class="relative inline-flex h-5 w-9 shrink-0 items-center">
      <input
        type="checkbox"
        class="peer sr-only"
        :checked="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <span
        class="absolute inset-0 rounded-full bg-elevated transition-colors duration-150 peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg"
      />
      <span
        class="relative h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 peer-checked:translate-x-[1.125rem]"
      />
    </span>
    <span v-if="label" class="text-sm text-ink-muted">{{ label }}</span>
    <span
      v-if="showStatus"
      class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      :class="modelValue ? 'bg-accent/15 text-accent-secondary' : 'bg-elevated text-ink-muted'"
    >
      {{ modelValue ? 'Enabled' : 'Disabled' }}
    </span>
  </label>
</template>
