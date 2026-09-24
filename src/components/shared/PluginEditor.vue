<script setup lang="ts">
import type { KongPlugin } from '../../types/kong'
import TagInput from './TagInput.vue'
import ToggleSwitch from './ToggleSwitch.vue'
import ProtocolPicker from './ProtocolPicker.vue'
import DynamicKeyValueEditor from './DynamicKeyValueEditor.vue'

const props = defineProps<{ modelValue: KongPlugin }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongPlugin] }>()

function update<K extends keyof KongPlugin>(key: K, value: KongPlugin[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="card space-y-3.5 p-3.5">
    <div class="flex items-center justify-between">
      <span class="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-sm font-medium text-accent-secondary">{{
        modelValue.name
      }}</span>
      <ToggleSwitch
        :model-value="modelValue.enabled ?? true"
        label="enabled"
        @update:model-value="(v) => update('enabled', v)"
      />
    </div>

    <div>
      <span class="field-label">Protocols</span>
      <ProtocolPicker :model-value="modelValue.protocols" @update:model-value="(v) => update('protocols', v)" />
    </div>

    <div>
      <span class="field-label">Tags</span>
      <TagInput :model-value="modelValue.tags" @update:model-value="(v) => update('tags', v)" />
    </div>

    <div>
      <span class="field-label">Config</span>
      <DynamicKeyValueEditor
        :model-value="modelValue.config ?? {}"
        @update:model-value="(v) => update('config', v)"
      />
    </div>
  </div>
</template>
