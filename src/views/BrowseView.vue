<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import Sidebar from '../components/layout/Sidebar.vue'
import PluginEditor from '../components/shared/PluginEditor.vue'
import Badge from '../components/shared/Badge.vue'
import ServiceList from '../components/browse/ServiceList.vue'
import ServiceDetail from '../components/browse/ServiceDetail.vue'
import ConsumerList from '../components/browse/ConsumerList.vue'
import ConsumerDetail from '../components/browse/ConsumerDetail.vue'
import type { KongService, KongConsumer } from '../types/kong'

const configStore = useConfigStore()
const activeTab = ref('services')
const pluginSearch = ref('')
const selectedServiceName = ref<string | undefined>(undefined)
const selectedConsumerUsername = ref<string | undefined>(undefined)

const tabs = [
  { id: 'services', label: 'Services' },
  { id: 'consumers', label: 'Consumers' },
  { id: 'plugins', label: 'Global Plugins' },
]

const services = computed(() => configStore.primary?.config.services ?? [])
const selectedService = computed(() => services.value.find((s) => s.name === selectedServiceName.value))

const consumers = computed(() => configStore.primary?.config.consumers ?? [])
const selectedConsumer = computed(() =>
  consumers.value.find((c) => c.username === selectedConsumerUsername.value),
)

function onSelectService(service: KongService) {
  selectedServiceName.value = service.name
}
function onServiceModified() {
  if (selectedServiceName.value) configStore.markModified(`service:${selectedServiceName.value}`)
}

function onSelectConsumer(consumer: KongConsumer) {
  selectedConsumerUsername.value = consumer.username
}
function onConsumerModified() {
  if (selectedConsumerUsername.value) configStore.markModified(`consumer:${selectedConsumerUsername.value}`)
}

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
    <div class="w-72 border-r border-slate-200 bg-white shrink-0">
      <Sidebar :tabs="tabs" :active-tab="activeTab" @update:active-tab="(id) => (activeTab = id)">
        <ServiceList
          v-if="activeTab === 'services'"
          :services="services"
          :selected-name="selectedServiceName"
          @select="onSelectService"
        />
        <ConsumerList
          v-else-if="activeTab === 'consumers'"
          :consumers="consumers"
          :selected-username="selectedConsumerUsername"
          @select="onSelectConsumer"
        />
        <div v-else class="p-3">
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
      </Sidebar>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="activeTab === 'services'">
        <ServiceDetail v-if="selectedService" :model-value="selectedService" @modified="onServiceModified" />
        <p v-else class="text-sm text-slate-400">Select a service from the list.</p>
      </div>

      <div v-else-if="activeTab === 'consumers'">
        <ConsumerDetail v-if="selectedConsumer" :model-value="selectedConsumer" @modified="onConsumerModified" />
        <p v-else class="text-sm text-slate-400">Select a consumer from the list.</p>
      </div>

      <div v-else class="space-y-3 max-w-2xl">
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
