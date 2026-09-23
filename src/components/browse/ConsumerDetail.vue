<script setup lang="ts">
import { computed } from 'vue'
import type { KongConsumer } from '../../types/kong'
import { isCredentialListKey } from '../../lib/secretFields'
import TagInput from '../shared/TagInput.vue'
import CredentialEditor from './CredentialEditor.vue'

const props = defineProps<{ modelValue: KongConsumer }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongConsumer]; modified: [] }>()

function update(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
  emit('modified')
}

const credentialListKeys = computed(() =>
  Object.keys(props.modelValue).filter((key) => isCredentialListKey(key) && Array.isArray(props.modelValue[key])),
)
</script>

<template>
  <div class="space-y-4 max-w-2xl">
    <h2 class="font-semibold text-slate-800">{{ modelValue.username ?? '(unnamed consumer)' }}</h2>

    <div class="grid grid-cols-2 gap-3">
      <label class="text-xs text-slate-500">
        Username
        <input
          type="text"
          :value="modelValue.username ?? ''"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('username', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Custom ID
        <input
          type="text"
          :value="modelValue.custom_id ?? ''"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('custom_id', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <label class="text-xs text-slate-500 block">
      Tags
      <TagInput :model-value="modelValue.tags" @update:model-value="(v) => update('tags', v)" />
    </label>

    <div v-for="listKey in credentialListKeys" :key="listKey">
      <h3 class="text-sm font-medium text-slate-700 mb-1">{{ listKey }}</h3>
      <CredentialEditor
        :model-value="modelValue[listKey] as Record<string, unknown>[]"
        :list-key="listKey"
        @update:model-value="(v) => update(listKey, v)"
      />
    </div>
  </div>
</template>
