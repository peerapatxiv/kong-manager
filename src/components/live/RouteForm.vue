<script setup lang="ts">
import { computed } from 'vue'
import { ROUTE_PROTOCOLS, routeFamily } from '../../lib/live/routeForm'
import type { RouteForm } from '../../lib/live/routeForm'
import FieldError from './FieldError.vue'
import AppSelect from '../shared/AppSelect.vue'
import SegmentedToggle from '../shared/SegmentedToggle.vue'
import ServicePicker from './ServicePicker.vue'
import type { ServiceOption } from './ServicePicker.vue'
import MethodPicker from '../shared/MethodPicker.vue'
import ProtocolPicker from '../shared/ProtocolPicker.vue'
import TagInput from '../shared/TagInput.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import ValueListEditor from '../shared/ValueListEditor.vue'

const REDIRECT_CODES = [426, 301, 302, 307, 308]
const PATH_HANDLING_OPTIONS = [
  { value: 'v0', label: 'v0' },
  { value: 'v1', label: 'v1' },
]

const props = defineProps<{
  modelValue: RouteForm
  serviceOptions: ServiceOption[]
  disabled?: boolean
  fieldErrors?: Record<string, string>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: RouteForm] }>()

function set<K extends keyof RouteForm>(key: K, value: RouteForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function numeric(event: Event): number | '' {
  const value = text(event)
  return value === '' ? '' : Number(value)
}

const family = computed(() => routeFamily(props.modelValue.protocols))
const showHttpFields = computed(() => family.value !== 'stream')
const showMethods = computed(() => family.value !== 'stream' && family.value !== 'grpc')
const showStreamFields = computed(() => family.value === 'stream' || family.value === null)
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Route</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Name</span>
          <input
            type="text"
            class="input-field"
            data-testid="route-name"
            placeholder="(unnamed route)"
            :value="modelValue.name"
            @input="set('name', text($event))"
          />
          <FieldError :message="fieldErrors?.name" />
        </label>
        <div>
          <span class="field-label">Service</span>
          <ServicePicker
            :model-value="modelValue.service"
            :options="serviceOptions"
            @update:model-value="(value) => set('service', value)"
          />
          <FieldError :message="fieldErrors?.service" />
        </div>
      </div>
      <div>
        <span class="field-label">Protocols</span>
        <ProtocolPicker
          :model-value="modelValue.protocols"
          :options="ROUTE_PROTOCOLS"
          @update:model-value="(value) => set('protocols', value)"
        />
        <FieldError :message="fieldErrors?.protocols" />
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Matching</h4>
      <div v-if="showHttpFields" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div data-testid="route-hosts">
          <span class="field-label">Hosts</span>
          <ValueListEditor
            add-label="Add host"
            placeholder="api.example.com"
            :model-value="modelValue.hosts"
            @update:model-value="(value) => set('hosts', value)"
          />
          <FieldError :message="fieldErrors?.hosts" />
        </div>
        <div data-testid="route-paths">
          <span class="field-label">Paths</span>
          <ValueListEditor
            add-label="Add path"
            placeholder="/v1/resource"
            :model-value="modelValue.paths"
            @update:model-value="(value) => set('paths', value)"
          />
          <FieldError :message="fieldErrors?.paths" />
        </div>
        <div v-if="showMethods">
          <span class="field-label">Methods</span>
          <MethodPicker :model-value="modelValue.methods" @update:model-value="(value) => set('methods', value)" />
          <FieldError :message="fieldErrors?.methods" />
        </div>
        <div>
          <span class="field-label">Headers</span>
          <ValueListEditor
            add-label="Add header"
            placeholder="X-Env: dev, prod"
            :model-value="modelValue.headers"
            @update:model-value="(value) => set('headers', value)"
          />
          <FieldError :message="fieldErrors?.headers" />
        </div>
      </div>
      <div v-if="showStreamFields" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <span class="field-label">Sources</span>
          <ValueListEditor
            add-label="Add source"
            placeholder="10.0.0.1:80"
            :model-value="modelValue.sources"
            @update:model-value="(value) => set('sources', value)"
          />
          <FieldError :message="fieldErrors?.sources" />
        </div>
        <div>
          <span class="field-label">Destinations</span>
          <ValueListEditor
            add-label="Add destination"
            placeholder="10.0.0.2:443"
            :model-value="modelValue.destinations"
            @update:model-value="(value) => set('destinations', value)"
          />
          <FieldError :message="fieldErrors?.destinations" />
        </div>
      </div>
      <div>
        <span class="field-label">SNIs</span>
        <ValueListEditor
          add-label="Add SNI"
          placeholder="example.com"
          :model-value="modelValue.snis"
          @update:model-value="(value) => set('snis', value)"
        />
        <FieldError :message="fieldErrors?.snis" />
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Behavior</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <span class="field-label">HTTPS redirect status</span>
          <AppSelect
            :model-value="modelValue.https_redirect_status_code"
            :options="REDIRECT_CODES.map((code) => ({ value: code, label: String(code) }))"
            aria-label="HTTPS redirect status"
            @update:model-value="(value) => set('https_redirect_status_code', value)"
          />
        </div>
        <label>
          <span class="field-label">Regex priority</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.regex_priority"
            @input="set('regex_priority', numeric($event))"
          />
        </label>
        <div>
          <span class="field-label">Path handling</span>
          <SegmentedToggle
            :model-value="modelValue.path_handling"
            :options="PATH_HANDLING_OPTIONS"
            aria-label="Path handling"
            @update:model-value="(value) => set('path_handling', value)"
          />
        </div>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <ToggleSwitch label="Strip path" :model-value="modelValue.strip_path" @update:model-value="(v) => set('strip_path', v)" />
        <ToggleSwitch label="Preserve host" :model-value="modelValue.preserve_host" @update:model-value="(v) => set('preserve_host', v)" />
        <ToggleSwitch label="Request buffering" :model-value="modelValue.request_buffering" @update:model-value="(v) => set('request_buffering', v)" />
        <ToggleSwitch label="Response buffering" :model-value="modelValue.response_buffering" @update:model-value="(v) => set('response_buffering', v)" />
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
