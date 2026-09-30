<script setup lang="ts">
import type { ConsumerForm } from '../../lib/live/consumerForm'
import FieldError from './FieldError.vue'
import TagInput from '../shared/TagInput.vue'

const props = defineProps<{ modelValue: ConsumerForm; disabled?: boolean; fieldErrors?: Record<string, string> }>()
const emit = defineEmits<{ 'update:modelValue': [value: ConsumerForm] }>()

function set<K extends keyof ConsumerForm>(key: K, value: ConsumerForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Consumer</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Username</span>
          <input
            type="text"
            class="input-field"
            data-testid="consumer-username"
            :value="modelValue.username"
            @input="set('username', text($event))"
          />
          <FieldError :message="fieldErrors?.username" />
        </label>
        <label>
          <span class="field-label">Custom ID</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="consumer-custom-id"
            spellcheck="false"
            :value="modelValue.custom_id"
            @input="set('custom_id', text($event))"
          />
          <FieldError :message="fieldErrors?.custom_id" />
        </label>
      </div>
      <p class="field-help">A consumer needs a username, a custom ID, or both.</p>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
