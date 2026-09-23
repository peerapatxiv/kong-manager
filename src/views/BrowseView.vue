<script setup lang="ts">
import { ref } from 'vue'
import { useConfigStore } from '../stores/config'
import Sidebar from '../components/layout/Sidebar.vue'
import PluginEditor from '../components/shared/PluginEditor.vue'
import Badge from '../components/shared/Badge.vue'

const configStore = useConfigStore()
const activeTab = ref('services')
const pluginSearch = ref('')

const tabs = [
  { id: 'services', label: 'Services' },
  { id: 'consumers', label: 'Consumers' },
  { id: 'plugins', label: 'Global Plugins' },
]

function filteredPlugins() {
  const query = pluginSearch.value.trim().toLowerCase()
  const plugins = configStore.primary?.config.plugins ?? []
  if (!query) return plugins
  return plugins.filter((p) => p.name.toLowerCase().includes(query))
}

function onPluginUpdate(index: number, updated: ReturnType<typeof filteredPlugins>[number]) {
  const plugins = configStore.primary?.config.plugins ?? []
  const target = filteredPlugins()[index]
  const realIndex = plugins.indexOf(target)
  if (realIndex === -1) return
  plugins[realIndex] = updated
  configStore.markModified(`plugin:global/${updated.name}`)
}
</script>

<template>
  <div class="flex h-[calc(100vh-3.5rem)]">
    <div class="w-72 border-r border-slate-200 bg-white">
      <Sidebar :tabs="tabs" :active-tab="activeTab" @update:active-tab="(id) => (activeTab = id)">
        <div v-if="activeTab === 'plugins'" class="p-3">
          <input
            v-model="pluginSearch"
            type="text"
            placeholder="Search plugins…"
            class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
          />
          <ul class="space-y-1">
            <li
              v-for="plugin in filteredPlugins()"
              :key="plugin.name"
              class="text-sm px-2 py-1 rounded flex items-center gap-2"
            >
              <span class="font-mono">{{ plugin.name }}</span>
              <Badge v-if="configStore.isModified(`plugin:global/${plugin.name}`)" variant="modified" />
            </li>
          </ul>
          <p v-if="filteredPlugins().length === 0" class="text-xs text-slate-400 mt-2">No global plugins.</p>
        </div>
        <div v-else class="p-3 text-sm text-slate-400">Coming in a later task.</div>
      </Sidebar>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="activeTab === 'plugins'" class="space-y-3 max-w-2xl">
        <PluginEditor
          v-for="(plugin, index) in filteredPlugins()"
          :key="plugin.name"
          :model-value="plugin"
          @update:model-value="(v) => onPluginUpdate(index, v)"
        />
      </div>
    </div>
  </div>
</template>
