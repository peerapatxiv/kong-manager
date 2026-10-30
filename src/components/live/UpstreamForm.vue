<script setup lang="ts">
import { computed } from 'vue'
import { UPSTREAM_ALGORITHMS, hashOptions } from '../../lib/live/upstreamForm'
import type { UpstreamForm } from '../../lib/live/upstreamForm'
import FieldError from './FieldError.vue'
import AppSelect from '../shared/AppSelect.vue'
import TagInput from '../shared/TagInput.vue'

const props = defineProps<{ modelValue: UpstreamForm; disabled?: boolean; fieldErrors?: Record<string, string> }>()
const emit = defineEmits<{ 'update:modelValue': [value: UpstreamForm] }>()

function set<K extends keyof UpstreamForm>(key: K, value: UpstreamForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function numeric(event: Event): number | '' {
  const value = text(event)
  return value === '' ? '' : Number(value)
}

const hashOnOptions = computed(() => hashOptions(props.modelValue.hash_on).map((value) => ({ value, label: value })))
const hashFallbackOptions = computed(() => hashOptions(props.modelValue.hash_fallback).map((value) => ({ value, label: value })))
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Upstream</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Name</span>
          <input
            type="text"
            class="input-field"
            data-testid="upstream-name"
            spellcheck="false"
            :value="modelValue.name"
            @input="set('name', text($event))"
          />
          <FieldError :message="fieldErrors?.name" />
        </label>
        <div>
          <span class="field-label">Algorithm</span>
          <AppSelect
            :model-value="modelValue.algorithm"
            :options="UPSTREAM_ALGORITHMS.map((algorithm) => ({ value: algorithm, label: algorithm }))"
            aria-label="Algorithm"
            data-testid="upstream-algorithm"
            @update:model-value="(value) => set('algorithm', value)"
          />
          <FieldError :message="fieldErrors?.algorithm" />
        </div>
        <div>
          <span class="field-label">Hash on</span>
          <AppSelect
            :model-value="modelValue.hash_on"
            :options="hashOnOptions"
            aria-label="Hash on"
            data-testid="upstream-hash-on"
            @update:model-value="(value) => set('hash_on', value)"
          />
          <FieldError :message="fieldErrors?.hash_on" />
        </div>
        <div>
          <span class="field-label">Hash fallback</span>
          <AppSelect
            :model-value="modelValue.hash_fallback"
            :options="hashFallbackOptions"
            aria-label="Hash fallback"
            data-testid="upstream-hash-fallback"
            @update:model-value="(value) => set('hash_fallback', value)"
          />
          <FieldError :message="fieldErrors?.hash_fallback" />
        </div>
        <label>
          <span class="field-label">Slots</span>
          <input
            type="number"
            class="input-field"
            data-testid="upstream-slots"
            :value="modelValue.slots"
            @input="set('slots', numeric($event))"
          />
          <FieldError :message="fieldErrors?.slots" />
        </label>
        <label>
          <span class="field-label">Host header</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="upstream-host-header"
            spellcheck="false"
            :value="modelValue.host_header"
            @input="set('host_header', text($event))"
          />
          <FieldError :message="fieldErrors?.host_header" />
        </label>
      </div>
    </section>
    <section class="space-y-3">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
