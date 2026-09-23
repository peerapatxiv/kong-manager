<script setup lang="ts">
import type { KongService, KongRoute } from '../../types/kong'
import TagInput from '../shared/TagInput.vue'
import RouteCard from './RouteCard.vue'

const props = defineProps<{ modelValue: KongService }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongService]; modified: [] }>()

function update<K extends keyof KongService>(key: K, value: KongService[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
  emit('modified')
}

function onRouteUpdate(index: number, updated: KongRoute) {
  const routes = [...(props.modelValue.routes ?? [])]
  routes[index] = updated
  update('routes', routes)
}
</script>

<template>
  <div class="space-y-4 max-w-2xl">
    <h2 class="font-semibold text-slate-800">{{ modelValue.name ?? '(unnamed service)' }}</h2>

    <div class="grid grid-cols-2 gap-3">
      <label class="text-xs text-slate-500">
        Host
        <input
          type="text"
          :value="modelValue.host"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('host', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Port
        <input
          type="number"
          :value="modelValue.port"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('port', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Protocol
        <input
          type="text"
          :value="modelValue.protocol"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('protocol', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Path
        <input
          type="text"
          :value="modelValue.path ?? ''"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('path', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Connect timeout (ms)
        <input
          type="number"
          :value="modelValue.connect_timeout"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('connect_timeout', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Read timeout (ms)
        <input
          type="number"
          :value="modelValue.read_timeout"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('read_timeout', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Write timeout (ms)
        <input
          type="number"
          :value="modelValue.write_timeout"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('write_timeout', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Retries
        <input
          type="number"
          :value="modelValue.retries"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('retries', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <label class="flex items-center gap-1.5 text-xs text-slate-600">
      <input
        type="checkbox"
        :checked="modelValue.enabled ?? true"
        @change="update('enabled', ($event.target as HTMLInputElement).checked)"
      />
      enabled
    </label>

    <label class="text-xs text-slate-500 block">
      Tags
      <TagInput :model-value="modelValue.tags" @update:model-value="(v) => update('tags', v)" />
    </label>

    <div v-if="(modelValue.routes ?? []).length > 0" class="space-y-2">
      <h3 class="text-sm font-medium text-slate-700">Routes</h3>
      <RouteCard
        v-for="(route, index) in modelValue.routes"
        :key="route.name ?? index"
        :model-value="route"
        :service-name="modelValue.name ?? ''"
        @update:model-value="(v) => onRouteUpdate(index, v)"
        @modified="emit('modified')"
      />
    </div>
  </div>
</template>
