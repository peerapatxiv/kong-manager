<script setup lang="ts">
import { computed } from 'vue'
import { SERVICE_PROTOCOLS, serviceProtocolUsesPath, serviceProtocolUsesTls } from '../../lib/live/serviceForm'
import type { ServiceForm } from '../../lib/live/serviceForm'
import FieldError from './FieldError.vue'
import TagInput from '../shared/TagInput.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import ValueListEditor from '../shared/ValueListEditor.vue'

const props = defineProps<{ modelValue: ServiceForm; disabled?: boolean; fieldErrors?: Record<string, string> }>()
const emit = defineEmits<{ 'update:modelValue': [value: ServiceForm] }>()

function set<K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function numeric(event: Event): number | '' {
  const value = text(event)
  return value === '' ? '' : Number(value)
}

const usesPath = computed(() => serviceProtocolUsesPath(props.modelValue.protocol))
const usesTls = computed(() => serviceProtocolUsesTls(props.modelValue.protocol))
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Service</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Name</span>
          <input
            type="text"
            class="input-field"
            data-testid="service-name"
            placeholder="(unnamed service)"
            :value="modelValue.name"
            @input="set('name', text($event))"
          />
          <FieldError :message="fieldErrors?.name" />
        </label>
        <label>
          <span class="field-label">Protocol</span>
          <select
            class="input-field"
            data-testid="service-protocol"
            :value="modelValue.protocol"
            @change="set('protocol', text($event))"
          >
            <option v-for="protocol in SERVICE_PROTOCOLS" :key="protocol" :value="protocol">{{ protocol }}</option>
          </select>
          <FieldError :message="fieldErrors?.protocol" />
        </label>
        <label>
          <span class="field-label">Host</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="service-host"
            spellcheck="false"
            :value="modelValue.host"
            @input="set('host', text($event))"
          />
          <FieldError :message="fieldErrors?.host" />
        </label>
        <label>
          <span class="field-label">Port</span>
          <input
            type="number"
            class="input-field"
            data-testid="service-port"
            :value="modelValue.port"
            @input="set('port', numeric($event))"
          />
          <FieldError :message="fieldErrors?.port" />
        </label>
        <label v-if="usesPath">
          <span class="field-label">Path</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="service-path"
            :value="modelValue.path"
            @input="set('path', text($event))"
          />
          <FieldError :message="fieldErrors?.path" />
        </label>
        <div class="flex items-end pb-1">
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
      <h4 class="section-heading">Timeouts and retries</h4>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label>
          <span class="field-label">Retries</span>
          <input type="number" class="input-field" :value="modelValue.retries" @input="set('retries', numeric($event))" />
        </label>
        <label>
          <span class="field-label">Connect timeout (ms)</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.connect_timeout"
            @input="set('connect_timeout', numeric($event))"
          />
        </label>
        <label>
          <span class="field-label">Write timeout (ms)</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.write_timeout"
            @input="set('write_timeout', numeric($event))"
          />
        </label>
        <label>
          <span class="field-label">Read timeout (ms)</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.read_timeout"
            @input="set('read_timeout', numeric($event))"
          />
        </label>
      </div>
    </section>

    <section v-if="usesTls" class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">TLS</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Client certificate id</span>
          <input
            type="text"
            class="input-field font-mono"
            spellcheck="false"
            :value="modelValue.client_certificate"
            @input="set('client_certificate', text($event))"
          />
          <FieldError :message="fieldErrors?.client_certificate" />
        </label>
        <label>
          <span class="field-label">Verify upstream certificate</span>
          <select
            class="input-field"
            :value="modelValue.tls_verify"
            @change="set('tls_verify', text($event) as ServiceForm['tls_verify'])"
          >
            <option value="inherit">Use Kong default</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label>
          <span class="field-label">Verify depth</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.tls_verify_depth"
            @input="set('tls_verify_depth', numeric($event))"
          />
        </label>
        <div>
          <span class="field-label">CA certificate ids</span>
          <ValueListEditor
            add-label="Add id"
            placeholder="certificate id"
            :model-value="modelValue.ca_certificates"
            @update:model-value="(value) => set('ca_certificates', value)"
          />
        </div>
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
