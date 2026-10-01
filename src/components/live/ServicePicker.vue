<script setup lang="ts">
import { computed } from 'vue'
import AppSelect from '../shared/AppSelect.vue'

export type ServiceOption = { id: string; label: string }

const props = defineProps<{ modelValue: string; options: ServiceOption[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const choices = computed(() => [
  { value: '', label: '(no service)' },
  ...props.options.map((option) => ({ value: option.id, label: option.label })),
])
</script>

<template>
  <AppSelect
    :model-value="modelValue"
    :options="choices"
    :disabled="disabled"
    searchable
    placeholder="(no service)"
    aria-label="Service"
    data-testid="route-service"
    @update:model-value="(value) => emit('update:modelValue', value)"
  />
</template>
