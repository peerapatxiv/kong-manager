<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newPluginForm, toPayload, validatePlugin } from '../../lib/live/pluginForm'
import type { PluginForm as PluginFormModel } from '../../lib/live/pluginForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import PluginFormFields from '../../components/live/PluginFormFields.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import LiveActionBar from '../../components/live/LiveActionBar.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import DetailHeader from '../../components/shared/DetailHeader.vue'
import ToggleSwitch from '../../components/shared/ToggleSwitch.vue'

const connection = useConnectionStore()
const {
  items,
  next,
  loading,
  error,
  load,
  loadMore,
  create: createEntity,
  save: saveEntity,
  remove: removeEntity,
  toggleEnabled: toggleEntity,
} = useLiveEntities<LiveEntity>('plugins')

const search = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<PluginFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

// The services, routes and consumers a plugin can be attached to: they fill the pickers and
// give the list readable names. They load in the background, so a row shows the id until
// its name has arrived.
const services = ref<LiveEntity[]>([])
const routes = ref<LiveEntity[]>([])
const consumers = ref<LiveEntity[]>([])

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')
const serviceLabel = (e: LiveEntity) => textOf(e.name) || textOf(e.host) || e.id
const routeLabel = (e: LiveEntity) => textOf(e.name) || (Array.isArray(e.paths) ? textOf(e.paths[0]) : '') || e.id
const consumerLabel = (e: LiveEntity) => textOf(e.username) || textOf(e.custom_id) || e.id

const asOptions = (list: LiveEntity[], labelOf: (e: LiveEntity) => string) =>
  list.map((e) => ({ value: e.id, label: labelOf(e) }))
const serviceOptions = computed(() => asOptions(services.value, serviceLabel))
const routeOptions = computed(() => asOptions(routes.value, routeLabel))
const consumerOptions = computed(() => asOptions(consumers.value, consumerLabel))

function nameFor(options: { value: string; label: string }[], id: string): string {
  return options.find((option) => option.value === id)?.label ?? id
}

type ScopePart = { kind: string; label: string }
function scopeOf(plugin: LiveEntity): ScopePart[] {
  const idOf = (ref: unknown) => textOf((ref as { id?: unknown } | null | undefined)?.id)
  const parts: ScopePart[] = []
  const service = idOf(plugin.service)
  const route = idOf(plugin.route)
  const consumer = idOf(plugin.consumer)
  if (service) parts.push({ kind: 'service', label: nameFor(serviceOptions.value, service) })
  if (route) parts.push({ kind: 'route', label: nameFor(routeOptions.value, route) })
  if (consumer) parts.push({ kind: 'consumer', label: nameFor(consumerOptions.value, consumer) })
  return parts.length > 0 ? parts : [{ kind: 'global', label: 'global' }]
}

function label(plugin: LiveEntity): string {
  return textOf(plugin.name) || plugin.id
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((plugin) => {
    const tags = Array.isArray(plugin.tags) ? (plugin.tags as string[]) : []
    const haystack = [plugin.name, ...scopeOf(plugin).map((part) => part.label), ...tags].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})

const fieldErrors = computed(() =>
  Object.fromEntries(
    Object.entries(error.value?.fields ?? {}).map(([field, problem]) => [
      field,
      typeof problem === 'string' ? problem : JSON.stringify(problem),
    ]),
  ),
)

function setForm(next: PluginFormModel | null) {
  form.value = next
  baseline.value = next ? JSON.stringify(next) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(plugin: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = plugin.id
  setForm(fromEntity(plugin))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm(newPluginForm())
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as PluginFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validatePlugin(form.value)
  validationErrors.value = errors
  if (errors.length > 0) return
  busy.value = true
  try {
    if (creating.value) {
      const created = await createEntity(toPayload(form.value, 'create'))
      creating.value = false
      selectedId.value = created.id
      setForm(fromEntity(created))
    } else if (selectedId.value) {
      const updated = await saveEntity(selectedId.value, toPayload(form.value, 'update'))
      setForm(fromEntity(updated))
    }
  } catch {
    // The error is already in `error` and shown in the banner; the form stays open.
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!selectedId.value || !window.confirm('Delete this plugin?')) return
  try {
    await removeEntity(selectedId.value)
    selectedId.value = null
    setForm(null)
  } catch {
    // Shown in the banner.
  }
}

async function toggle(plugin: LiveEntity, enabled: boolean) {
  try {
    await toggleEntity(plugin.id, enabled)
  } catch {
    return
  }
  const updated = items.value.find((item) => item.id === plugin.id)
  if (updated && selectedId.value === plugin.id && !dirty.value) setForm(fromEntity(updated))
}

async function loadTargets() {
  const listAll = async (resource: 'services' | 'routes' | 'consumers') => {
    try {
      return await connection.client<LiveEntity>(resource).listAll({ size: 1000 })
    } catch {
      return []
    }
  }
  const [s, r, c] = await Promise.all([listAll('services'), listAll('routes'), listAll('consumers')])
  services.value = s
  routes.value = r
  consumers.value = c
}

// Leaving the page would silently drop unsaved edits, so ask first (false cancels).
onBeforeRouteLeave(() => confirmDiscard())

onMounted(() => {
  if (!connection.isConnected) return
  void load()
  void loadTargets()
})
watch(
  () => connection.active?.baseUrl,
  (baseUrl) => {
    selectedId.value = null
    setForm(null)
    if (baseUrl) {
      void load()
      void loadTargets()
    }
  },
)
</script>

<template>
  <LiveGate>
    <LiveWorkspace
      storage-key="kong-config:live-plugins-panel-width"
      :has-more="Boolean(next)"
      :loading="loading"
      @load-more="loadMore"
    >
      <template #toolbar>
        <LiveListToolbar
          v-model:search="search"
          placeholder="Search loaded plugins…"
          new-testid="new-plugin"
          :can-create="connection.canWrite"
          @create="startCreate"
        />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="plugin in filtered"
            :key="plugin.id"
            data-testid="plugin-row"
            :title="label(plugin)"
            :selected="plugin.id === selectedId"
            @click="select(plugin)"
          >
            {{ label(plugin) }}
            <template #sub>
              <span class="flex items-center gap-1.5">
                <span
                  v-for="part in scopeOf(plugin)"
                  :key="part.kind"
                  class="min-w-0 truncate rounded bg-elevated px-1.5 py-px text-[10px] font-medium"
                  :title="`${part.kind}: ${part.label}`"
                >
                  <template v-if="part.kind !== 'global'">{{ part.kind }}: </template>{{ part.label }}
                </span>
              </span>
            </template>
            <template #trail>
              <fieldset :disabled="!connection.canWrite" class="contents" @click.stop>
                <ToggleSwitch
                  :model-value="plugin.enabled !== false"
                  @update:model-value="(value) => toggle(plugin, value)"
                />
              </fieldset>
            </template>
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No plugins.</p>
      </template>

      <template #detail>
        <div class="h-full space-y-4">
          <LiveErrorBanner :messages="validationErrors" :error="error" />
          <div v-if="form" class="space-y-4">
            <div class="card space-y-5 p-5">
              <DetailHeader
                :initial="(form.name || '+').charAt(0)"
                :title="creating ? 'New plugin' : form.name || 'Plugin'"
                :subtitle="!creating && selectedId ? selectedId : undefined"
              />
              <PluginFormFields
                :key="selectedId ?? 'new'"
                v-model="form"
                :creating="creating"
                :available-plugins="connection.availablePlugins"
                :service-options="serviceOptions"
                :route-options="routeOptions"
                :consumer-options="consumerOptions"
                :disabled="!connection.canWrite"
                :field-errors="fieldErrors"
              />
            </div>
          </div>
          <EmptyState v-else icon="plug" title="Select a plugin from the list, or create a new one." />
        </div>
      </template>

      <template v-if="form" #detail-footer>
        <LiveActionBar
          :creating="creating"
          :dirty="dirty"
          :can-save="canSave"
          :can-write="connection.canWrite"
          :busy="busy"
          @delete="remove"
          @discard="discard"
          @save="save"
        />
      </template>
    </LiveWorkspace>
  </LiveGate>
</template>
