<script setup lang="ts">
import type { KongPlugin } from '../../types/kong'
import { KONG_PROTOCOLS } from '../../types/kong'
import TagInput from './TagInput.vue'
import DynamicKeyValueEditor from './DynamicKeyValueEditor.vue'

const props = defineProps<{ modelValue: KongPlugin }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongPlugin] }>()

function update<K extends keyof KongPlugin>(key: K, value: KongPlugin[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function toggleProtocol(protocol: string, checked: boolean) {
  const current = props.modelValue.protocols ?? []
  const next = checked ? [...current, protocol] : current.filter((p) => p !== protocol)
  update('protocols', next)
}
</script>

<template>
  <div class="border border-slate-200 rounded-lg p-3 bg-white space-y-3">
    <div class="flex items-center justify-between">
      <span class="font-mono text-sm font-medium">{{ modelValue.name }}</span>
      <label class="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          :checked="modelValue.enabled ?? true"
          @change="update('enabled', ($event.target as HTMLInputElement).checked)"
        />
        enabled
      </label>
    </div>

    <div>
      <span class="text-xs text-slate-500 block mb-1">Protocols</span>
      <div class="flex flex-wrap gap-3">
        <label v-for="protocol in KONG_PROTOCOLS" :key="protocol" class="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            :checked="(modelValue.protocols ?? []).includes(protocol)"
            @change="toggleProtocol(protocol, ($event.target as HTMLInputElement).checked)"
          />
          {{ protocol }}
        </label>
      </div>
    </div>

    <div>
      <span class="text-xs text-slate-500 block mb-1">Tags</span>
      <TagInput :model-value="modelValue.tags" @update:model-value="(v) => update('tags', v)" />
    </div>

    <div>
      <span class="text-xs text-slate-500 block mb-1">Config</span>
      <DynamicKeyValueEditor
        :model-value="modelValue.config ?? {}"
        @update:model-value="(v) => update('config', v)"
      />
    </div>
  </div>
</template>
