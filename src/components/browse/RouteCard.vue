<script setup lang="ts">
import { ref } from 'vue'
import type { KongRoute } from '../../types/kong'
import { KONG_PROTOCOLS } from '../../types/kong'
import TagInput from '../shared/TagInput.vue'
import PluginEditor from '../shared/PluginEditor.vue'

const props = defineProps<{ modelValue: KongRoute; serviceName: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongRoute]; modified: [] }>()

const expanded = ref(false)

function update<K extends keyof KongRoute>(key: K, value: KongRoute[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
  emit('modified')
}

function toggleProtocol(protocol: string, checked: boolean) {
  const current = props.modelValue.protocols ?? []
  update('protocols', checked ? [...current, protocol] : current.filter((p) => p !== protocol))
}

function onPluginUpdate(index: number, updated: NonNullable<KongRoute['plugins']>[number]) {
  const plugins = [...(props.modelValue.plugins ?? [])]
  plugins[index] = updated
  update('plugins', plugins)
}
</script>

<template>
  <div class="border border-slate-200 rounded-lg bg-white">
    <button
      type="button"
      class="w-full flex items-center justify-between px-3 py-2 text-left"
      @click="expanded = !expanded"
    >
      <span class="font-mono text-sm">{{ modelValue.name ?? '(unnamed route)' }}</span>
      <span class="text-xs text-slate-400">{{ expanded ? 'collapse' : 'expand' }}</span>
    </button>

    <div v-if="expanded" class="border-t border-slate-100 p-3 space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs text-slate-500">
          Hosts
          <TagInput :model-value="modelValue.hosts" @update:model-value="(v) => update('hosts', v)" />
        </label>
        <label class="text-xs text-slate-500">
          Paths
          <TagInput :model-value="modelValue.paths" @update:model-value="(v) => update('paths', v)" />
        </label>
        <label class="text-xs text-slate-500">
          Methods
          <TagInput :model-value="modelValue.methods" @update:model-value="(v) => update('methods', v)" />
        </label>
        <label class="text-xs text-slate-500">
          Path handling
          <input
            type="text"
            :value="modelValue.path_handling ?? ''"
            class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            @input="update('path_handling', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <div class="flex gap-4 text-xs">
        <label class="flex items-center gap-1.5">
          <input
            type="checkbox"
            :checked="modelValue.strip_path ?? false"
            @change="update('strip_path', ($event.target as HTMLInputElement).checked)"
          />
          strip_path
        </label>
        <label class="flex items-center gap-1.5">
          <input
            type="checkbox"
            :checked="modelValue.preserve_host ?? false"
            @change="update('preserve_host', ($event.target as HTMLInputElement).checked)"
          />
          preserve_host
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

      <div v-if="(modelValue.plugins ?? []).length > 0" class="space-y-2">
        <span class="text-xs text-slate-500 block">Route plugins</span>
        <PluginEditor
          v-for="(plugin, index) in modelValue.plugins"
          :key="plugin.name"
          :model-value="plugin"
          @update:model-value="(v) => onPluginUpdate(index, v)"
        />
      </div>
    </div>
  </div>
</template>
