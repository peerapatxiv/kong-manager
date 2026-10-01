<script setup lang="ts">
import AppIcon from '../components/shared/AppIcon.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import { useResizablePanel } from '../composables/useResizablePanel'
import { ref, computed, watch } from 'vue'
import { useConfigStore } from '../stores/config'
import Sidebar from '../components/layout/Sidebar.vue'
import PluginEditor from '../components/shared/PluginEditor.vue'
import ServiceList from '../components/browse/ServiceList.vue'
import ServiceDetail from '../components/browse/ServiceDetail.vue'
import ConsumerList from '../components/browse/ConsumerList.vue'
import ConsumerDetail from '../components/browse/ConsumerDetail.vue'
import PluginList from '../components/browse/PluginList.vue'
import StatTile from '../components/shared/StatTile.vue'
import type { KongService, KongConsumer, KongPlugin } from '../types/kong'

const configStore = useConfigStore()
const activeTab = ref('services')
const selectedServiceName = ref<string | undefined>(undefined)
const selectedConsumerUsername = ref<string | undefined>(undefined)
const selectedPluginName = ref<string | undefined>(undefined)

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
function onServiceUpdate(updated: KongService) {
  const list = configStore.primary?.config.services
  const index = list?.findIndex((s) => s.name === selectedServiceName.value) ?? -1
  if (!list || index === -1) return
  list[index] = updated
  // Name is editable via Code mode and doubles as the selection/identity key
  // — keep the detail panel pointed at this entry if it just changed.
  if (updated.name !== selectedServiceName.value) {
    selectedServiceName.value = updated.name
  }
}

function onSelectConsumer(consumer: KongConsumer) {
  selectedConsumerUsername.value = consumer.username
}
function onConsumerModified() {
  if (selectedConsumerUsername.value) configStore.markModified(`consumer:${selectedConsumerUsername.value}`)
}
function onConsumerUpdate(updated: KongConsumer) {
  const list = configStore.primary?.config.consumers
  const index = list?.findIndex((c) => c.username === selectedConsumerUsername.value) ?? -1
  if (!list || index === -1) return
  list[index] = updated
  // Username is editable and doubles as the selection/identity key — keep the
  // detail panel pointed at this entry, and mark modified under the new key,
  // if it just changed.
  if (updated.username !== selectedConsumerUsername.value) {
    selectedConsumerUsername.value = updated.username
  }
}

const plugins = computed(() => configStore.primary?.config.plugins ?? [])
const selectedPlugin = computed(() => plugins.value.find((p) => p.name === selectedPluginName.value))

function clonePlugin(plugin: KongPlugin): KongPlugin {
  return JSON.parse(JSON.stringify(plugin))
}

// The working copy the plugin form edits — nothing reaches the store until
// savePlugin() runs, mirroring the Service/Consumer detail panels.
const pluginDraft = ref<KongPlugin | null>(null)
const pluginBaseline = ref<KongPlugin | null>(null)
const pluginJustSaved = ref(false)
const pluginDirty = computed(
  () => JSON.stringify(pluginDraft.value) !== JSON.stringify(pluginBaseline.value),
)

watch(
  selectedPlugin,
  (plugin) => {
    pluginDraft.value = plugin ? clonePlugin(plugin) : null
    pluginBaseline.value = plugin ? clonePlugin(plugin) : null
  },
  { immediate: true },
)

function onSelectPlugin(plugin: KongPlugin) {
  selectedPluginName.value = plugin.name
}
function onPluginDraftUpdate(updated: KongPlugin) {
  pluginDraft.value = updated
}
function savePlugin() {
  if (!pluginDraft.value) return
  const list = configStore.primary?.config.plugins
  const index = list?.findIndex((p) => p.name === selectedPluginName.value) ?? -1
  if (!list || index === -1) return
  list[index] = pluginDraft.value
  configStore.markModified(`plugin:global/${pluginDraft.value.name}`)
  pluginBaseline.value = clonePlugin(pluginDraft.value)
  pluginJustSaved.value = true
  setTimeout(() => (pluginJustSaved.value = false), 1600)
}
function discardPlugin() {
  if (pluginDirty.value && !window.confirm('Discard your unsaved changes?')) return
  pluginDraft.value = pluginBaseline.value ? clonePlugin(pluginBaseline.value) : null
}

// The list panel's width is user-resizable (drag the handle on its right edge) since real
// service/consumer names vary wildly in length. Persisted so the choice survives a reload.
const { panelStyle, isResizing, startResize, resetPanelWidth } = useResizablePanel({
  storageKey: 'kong-config:browse-panel-width',
  defaultWidth: 384,
  min: 260,
  max: 720,
})
</script>

<template>
  <div class="flex flex-col lg:h-[calc(100vh-4rem)]">
    <div class="shrink-0 border-b border-border bg-surface px-6 py-2.5">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile compact label="Services" :value="configStore.summary.services">
          <template #icon>
            <AppIcon name="list" class="h-3.5 w-3.5" />
          </template>
        </StatTile>
        <StatTile compact label="Routes" :value="configStore.summary.routes">
          <template #icon>
            <AppIcon name="route" class="h-3.5 w-3.5" />
          </template>
        </StatTile>
        <StatTile compact label="Consumers" :value="configStore.summary.consumers">
          <template #icon>
            <AppIcon name="user" class="h-3.5 w-3.5" />
          </template>
        </StatTile>
        <StatTile compact label="Global plugins" :value="configStore.summary.globalPlugins">
          <template #icon>
            <AppIcon name="plug" class="h-3.5 w-3.5" />
          </template>
        </StatTile>
      </div>
    </div>

    <div class="flex flex-1 flex-col lg:flex-row lg:overflow-hidden" data-testid="browse-layout">
      <div
        class="relative w-full h-80 lg:h-full border-b lg:border-b-0 lg:border-r border-border bg-surface shrink-0"
        data-testid="list-panel"
        :style="panelStyle"
      >
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
          <PluginList v-else :plugins="plugins" :selected-name="selectedPluginName" @select="onSelectPlugin" />
        </Sidebar>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize service list panel"
          class="absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none items-center justify-center lg:flex hover:[&>span]:bg-accent/50"
          @pointerdown="startResize"
          @dblclick="resetPanelWidth"
        >
          <span
            class="h-8 w-[3px] rounded-full transition-colors duration-150"
            :class="isResizing ? 'bg-accent' : 'bg-transparent'"
          />
        </div>
      </div>

      <div class="flex flex-1 flex-col lg:overflow-y-auto p-6">
        <div v-if="activeTab === 'services'" class="flex-1">
          <ServiceDetail
            v-if="selectedService"
            :model-value="selectedService"
            @update:model-value="onServiceUpdate"
            @modified="onServiceModified"
          />
          <EmptyState v-else icon="list" title="Select a service from the list to view and edit it." />
        </div>

        <div v-else-if="activeTab === 'consumers'" class="flex-1">
          <ConsumerDetail
            v-if="selectedConsumer"
            :model-value="selectedConsumer"
            @update:model-value="onConsumerUpdate"
            @modified="onConsumerModified"
          />
          <EmptyState v-else icon="user" title="Select a consumer from the list to view and edit it." />
        </div>

        <div v-else class="max-w-4xl flex-1">
          <div v-if="pluginDraft" class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <Transition
                enter-active-class="transition duration-150"
                enter-from-class="opacity-0 -translate-y-0.5"
                leave-active-class="transition duration-150"
                leave-to-class="opacity-0"
              >
                <span
                  v-if="pluginJustSaved"
                  class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-secondary dark:bg-accent/20 dark:text-accent"
                >
                  <AppIcon name="check" class="h-3 w-3" />
                  Saved
                </span>
                <span v-else-if="pluginDirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                  <span class="h-1.5 w-1.5 rounded-full bg-accent" />
                  Unsaved changes
                </span>
                <span v-else />
              </Transition>
              <div class="ml-auto flex h-9 items-center gap-2">
                <button type="button" class="btn-secondary h-full py-0" :disabled="!pluginDirty" @click="discardPlugin">Discard</button>
                <button type="button" class="btn-primary h-full py-0" :disabled="!pluginDirty" @click="savePlugin">Save</button>
              </div>
            </div>
            <PluginEditor :model-value="pluginDraft" @update:model-value="onPluginDraftUpdate" />
          </div>
          <EmptyState v-else icon="plug" title="Select a plugin from the list to view and edit it." />
        </div>
      </div>
    </div>
  </div>
</template>
