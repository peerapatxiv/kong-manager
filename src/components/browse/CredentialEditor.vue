<script setup lang="ts">
import AppIcon from '../shared/AppIcon.vue'
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
    <div v-for="(entry, index) in modelValue" :key="index" class="card space-y-1.5 p-3">
      <div v-for="(value, key) in entry" :key="key" class="flex items-center gap-2">
        <label class="w-24 shrink-0 text-xs font-mono text-ink-muted">{{ key }}</label>
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
          class="input-field flex-1"
          @input="updateEntry(index, String(key), ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="flex justify-end border-t border-border pt-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-ink-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
          @click="removeEntry(index)"
        >
          <AppIcon name="x" class="h-3.5 w-3.5" />
          Remove {{ listKey.replace(/_credentials$/, '') }} entry
        </button>
      </div>
    </div>
    <p v-if="modelValue.length === 0" class="text-xs text-ink-muted">No {{ listKey }}.</p>
  </div>
</template>
