<script setup lang="ts">
import { computed, ref } from 'vue'

export type ServiceOption = { id: string; label: string }

const props = defineProps<{ modelValue: string; options: ServiceOption[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const query = ref('')
const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return props.options.filter(
    (option) => !needle || option.label.toLowerCase().includes(needle) || option.id === props.modelValue,
  )
})
const unknownSelected = computed(() => props.modelValue !== '' && !props.options.some((o) => o.id === props.modelValue))
</script>

<template>
  <div class="space-y-1.5">
    <input
      v-model="query"
      type="text"
      class="input-field text-xs"
      placeholder="Search services…"
      data-testid="service-picker-search"
      :disabled="disabled"
    />
    <select
      class="input-field"
      data-testid="route-service"
      :disabled="disabled"
      :value="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">(no service)</option>
      <option v-for="option in visible" :key="option.id" :value="option.id">{{ option.label }}</option>
      <option v-if="unknownSelected" :value="modelValue">{{ modelValue }}</option>
    </select>
  </div>
</template>
