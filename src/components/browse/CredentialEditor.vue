<script setup lang="ts">
import { isSecretField } from '../../lib/secretFields'
import SecretField from '../shared/SecretField.vue'
import TagInput from '../shared/TagInput.vue'

const props = defineProps<{ modelValue: Record<string, unknown>[]; listKey: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>[]] }>()

function updateEntry(index: number, key: string, value: unknown) {
  const next = [...props.modelValue]
  next[index] = { ...next[index], [key]: value }
  emit('update:modelValue', next)
}

function removeEntry(index: number) {
  const next = [...props.modelValue]
  next.splice(index, 1)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="(entry, index) in modelValue" :key="index" class="border border-slate-200 rounded p-2 space-y-1.5">
      <div v-for="(value, key) in entry" :key="key" class="flex items-center gap-2">
        <label class="w-24 shrink-0 text-xs font-mono text-slate-500">{{ key }}</label>
        <SecretField
          v-if="isSecretField(String(key)) && typeof value === 'string'"
          :model-value="value"
          @update:model-value="(v) => updateEntry(index, String(key), v)"
        />
        <TagInput
          v-else-if="Array.isArray(value)"
          :model-value="value as string[]"
          @update:model-value="(v) => updateEntry(index, String(key), v)"
        />
        <input
          v-else
          type="text"
          :value="value as string"
          class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm"
          @input="updateEntry(index, String(key), ($event.target as HTMLInputElement).value)"
        />
      </div>
      <button type="button" class="text-xs text-slate-400 hover:text-red-600" @click="removeEntry(index)">
        remove {{ listKey.replace(/_credentials$/, '') }} entry
      </button>
    </div>
    <p v-if="modelValue.length === 0" class="text-xs text-slate-400">No {{ listKey }}.</p>
  </div>
</template>
