<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PluginForm } from '../../lib/live/pluginForm'
import FieldError from './FieldError.vue'
import AppSelect from '../shared/AppSelect.vue'
import DynamicKeyValueEditor from '../shared/DynamicKeyValueEditor.vue'
import ProtocolPicker from '../shared/ProtocolPicker.vue'
import SegmentedToggle from '../shared/SegmentedToggle.vue'
import TagInput from '../shared/TagInput.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'

type Option = { value: string; label: string }

const props = defineProps<{
  modelValue: PluginForm
  /** A plugin can only be chosen when it is created; Kong cannot rename one. */
  creating: boolean
  availablePlugins: string[]
  serviceOptions: Option[]
  routeOptions: Option[]
  consumerOptions: Option[]
  disabled?: boolean
  fieldErrors?: Record<string, string>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: PluginForm] }>()

function set<K extends keyof PluginForm>(key: K, value: PluginForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const nameOptions = computed(() => props.availablePlugins.map((name) => ({ value: name, label: name })))
const withAny = (options: Option[]) => [{ value: '', label: '(any)' }, ...options]

// The config can be edited as a key/value form or as raw JSON. In JSON mode a half-typed
// document is never applied: only a valid object replaces the config.
const MODE_OPTIONS = [
  { value: 'form', label: 'Form' },
  { value: 'json', label: 'JSON' },
]
const mode = ref<'form' | 'json'>('form')
const jsonText = ref('')
const jsonError = ref<string | null>(null)
const pretty = (config: unknown) => JSON.stringify(config ?? {}, null, 2)

function setMode(next: 'form' | 'json') {
  if (next === 'json') {
    jsonText.value = pretty(props.modelValue.config)
    jsonError.value = null
  }
  mode.value = next
}

function onJsonInput(event: Event) {
  jsonText.value = (event.target as HTMLTextAreaElement).value
  try {
    const parsed: unknown = JSON.parse(jsonText.value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      jsonError.value = 'The config must be a JSON object, like {"key": "value"}.'
      return
    }
    jsonError.value = null
    set('config', parsed as Record<string, unknown>)
  } catch (err) {
    jsonError.value = `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`
  }
}

// Discard or switching plugins changes the config from outside; keep the JSON view in step.
watch(
  () => props.modelValue.config,
  (config) => {
    if (mode.value !== 'json') return
    let current: unknown
    try {
      current = JSON.parse(jsonText.value)
    } catch {
      current = undefined
    }
    if (JSON.stringify(current) !== JSON.stringify(config)) {
      jsonText.value = pretty(config)
      jsonError.value = null
    }
  },
)
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Plugin</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <span class="field-label">Plugin</span>
          <AppSelect
            :model-value="modelValue.name"
            :options="nameOptions"
            :disabled="!creating"
            searchable
            placeholder="Choose a plugin…"
            aria-label="Plugin"
            data-testid="plugin-name"
            @update:model-value="(value) => set('name', value)"
          />
          <FieldError :message="fieldErrors?.name" />
        </div>
        <div class="flex items-end pb-1.5">
          <ToggleSwitch
            label="Enabled"
            show-status
            :model-value="modelValue.enabled"
            @update:model-value="(value) => set('enabled', value)"
          />
        </div>
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Applies to</h4>
      <p class="field-help !mt-0">Leave all three on (any) to run the plugin globally.</p>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <span class="field-label">Service</span>
          <AppSelect
            :model-value="modelValue.service"
            :options="withAny(serviceOptions)"
            searchable
            aria-label="Service"
            data-testid="plugin-service"
            @update:model-value="(value) => set('service', value)"
          />
          <FieldError :message="fieldErrors?.service" />
        </div>
        <div>
          <span class="field-label">Route</span>
          <AppSelect
            :model-value="modelValue.route"
            :options="withAny(routeOptions)"
            searchable
            aria-label="Route"
            data-testid="plugin-route"
            @update:model-value="(value) => set('route', value)"
          />
          <FieldError :message="fieldErrors?.route" />
        </div>
        <div>
          <span class="field-label">Consumer</span>
          <AppSelect
            :model-value="modelValue.consumer"
            :options="withAny(consumerOptions)"
            searchable
            aria-label="Consumer"
            data-testid="plugin-consumer"
            @update:model-value="(value) => set('consumer', value)"
          />
          <FieldError :message="fieldErrors?.consumer" />
        </div>
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Protocols and tags</h4>
      <div>
        <span class="field-label">Protocols</span>
        <ProtocolPicker :model-value="modelValue.protocols" @update:model-value="(value) => set('protocols', value)" />
        <FieldError :message="fieldErrors?.protocols" />
      </div>
      <div>
        <span class="field-label">Tags</span>
        <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <div class="flex items-center justify-between gap-3">
        <h4 class="section-heading">Config</h4>
        <SegmentedToggle
          :model-value="mode"
          :options="MODE_OPTIONS"
          aria-label="Edit config as"
          data-testid="config-mode"
          @update:model-value="(value) => setMode(value as 'form' | 'json')"
        />
      </div>
      <DynamicKeyValueEditor
        v-if="mode === 'form'"
        :model-value="modelValue.config"
        @update:model-value="(value) => set('config', value)"
      />
      <template v-else>
        <textarea
          :value="jsonText"
          rows="14"
          spellcheck="false"
          class="input-field font-mono text-xs"
          data-testid="config-json"
          aria-label="Config as JSON"
          @input="onJsonInput"
        />
        <p v-if="jsonError" class="field-help !text-red-600 dark:!text-red-400" data-testid="config-json-error">
          {{ jsonError }}
        </p>
      </template>
      <FieldError :message="fieldErrors?.config" />
    </section>
  </fieldset>
</template>
