<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newRouteForm, toPayload, validateRoute } from '../../lib/live/routeForm'
import type { RouteForm as RouteFormModel } from '../../lib/live/routeForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import RouteForm from '../../components/live/RouteForm.vue'
import AppSelect from '../../components/shared/AppSelect.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import LiveActionBar from '../../components/live/LiveActionBar.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import DetailHeader from '../../components/shared/DetailHeader.vue'

const connection = useConnectionStore()
const route = useRoute()
const router = useRouter()

const serviceFilter = ref(typeof route.query.service === 'string' ? route.query.service : '')
const services = ref<LiveEntity[]>([])

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
} = useLiveEntities<LiveEntity>('routes', {
  listVia: () =>
    serviceFilter.value ? { resource: 'service_routes', parentId: serviceFilter.value } : undefined,
})

const search = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<RouteFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

function serviceLabel(service: LiveEntity): string {
  return typeof service.name === 'string' && service.name ? service.name : String(service.host ?? service.id)
}
const serviceOptions = computed(() => services.value.map((s) => ({ id: s.id, label: serviceLabel(s) })))
const serviceFilterOptions = computed(() => [
  { value: '', label: 'All services' },
  ...serviceOptions.value.map((option) => ({ value: option.id, label: option.label })),
])

function serviceNameOf(routeEntity: LiveEntity): string {
  const id = (routeEntity.service as { id?: string } | null | undefined)?.id
  if (!id) return ''
  return serviceOptions.value.find((option) => option.id === id)?.label ?? id
}

function label(routeEntity: LiveEntity): string {
  if (typeof routeEntity.name === 'string' && routeEntity.name) return routeEntity.name
  const paths = Array.isArray(routeEntity.paths) ? (routeEntity.paths as string[]) : []
  return paths[0] ?? routeEntity.id
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((routeEntity) => {
    const list = (value: unknown) => (Array.isArray(value) ? (value as string[]) : [])
    const haystack = [
      routeEntity.name,
      serviceNameOf(routeEntity),
      ...list(routeEntity.paths),
      ...list(routeEntity.hosts),
      ...list(routeEntity.tags),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
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

function setForm(next: RouteFormModel | null) {
  form.value = next
  baseline.value = next ? JSON.stringify(next) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(routeEntity: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = routeEntity.id
  setForm(fromEntity(routeEntity))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm({ ...newRouteForm(), service: serviceFilter.value })
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as RouteFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validateRoute(form.value)
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
  if (!selectedId.value || !window.confirm('Delete this route?')) return
  try {
    await removeEntity(selectedId.value)
    selectedId.value = null
    setForm(null)
  } catch {
    // Shown in the banner.
  }
}

async function loadServices() {
  try {
    services.value = await connection.client<LiveEntity>('services').listAll()
  } catch {
    services.value = []
  }
}

function start() {
  void loadServices()
  void load()
}

// Leaving the page would silently drop unsaved edits, so ask first (false cancels).
onBeforeRouteLeave(() => confirmDiscard())

onMounted(() => {
  if (connection.isConnected) start()
})
watch(
  () => connection.active?.baseUrl,
  (baseUrl) => {
    selectedId.value = null
    setForm(null)
    if (baseUrl) start()
  },
)
watch(serviceFilter, (id) => {
  router.replace({ query: { ...route.query, service: id || undefined } })
  void load()
})
</script>

<template>
  <LiveGate>
    <LiveWorkspace storage-key="kong-config:live-routes-panel-width" :has-more="Boolean(next)" :loading="loading" @load-more="loadMore">
      <template #toolbar>
        <LiveListToolbar
          v-model:search="search"
          placeholder="Search loaded routes…"
          new-testid="new-route"
          :can-create="connection.canWrite"
          @create="startCreate"
        >
          <AppSelect
            v-model="serviceFilter"
            :options="serviceFilterOptions"
            searchable
            aria-label="Filter by service"
            data-testid="service-filter"
          />
        </LiveListToolbar>
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="routeEntity in filtered"
            :key="routeEntity.id"
            data-testid="route-row"
            :title="label(routeEntity)"
            :selected="routeEntity.id === selectedId"
            @click="select(routeEntity)"
          >
            {{ label(routeEntity) }}
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No routes.</p>
      </template>

      <template #detail>
        <div class="h-full space-y-4">
          <LiveErrorBanner :messages="validationErrors" :error="error" />
          <div v-if="form" class="space-y-4">
            <div class="card space-y-5 p-5">
              <DetailHeader
                :initial="(form.name || '?').charAt(0)"
                :title="creating ? 'New route' : form.name || 'Route'"
                :subtitle="!creating && selectedId ? selectedId : undefined"
              />
              <RouteForm
                v-model="form"
                :service-options="serviceOptions"
                :disabled="!connection.canWrite"
                :field-errors="fieldErrors"
              />
            </div>
          </div>
          <EmptyState v-else icon="route" title="Select a route from the list, or create a new one." />
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
