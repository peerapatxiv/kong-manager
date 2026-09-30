<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newRouteForm, toPayload, validateRoute } from '../../lib/live/routeForm'
import type { RouteForm as RouteFormModel } from '../../lib/live/routeForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import RouteForm from '../../components/live/RouteForm.vue'
import SearchInput from '../../components/shared/SearchInput.vue'

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
  tagFilter,
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
const tagText = ref('')
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

function applyTagFilter() {
  tagFilter.value = tagText.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  void load()
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
    <div class="flex flex-1 flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      <div
        class="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-80 lg:border-b-0 lg:border-r"
        data-testid="live-list-panel"
      >
        <div class="space-y-2 p-3">
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <SearchInput v-model="search" placeholder="Search loaded routes…" />
            </div>
            <button
              type="button"
              class="btn-primary"
              data-testid="new-route"
              :disabled="!connection.canWrite"
              @click="startCreate"
            >
              New
            </button>
          </div>
          <select v-model="serviceFilter" class="input-field text-xs" data-testid="service-filter">
            <option value="">All services</option>
            <option v-for="option in serviceOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
          <input
            v-model="tagText"
            type="text"
            class="input-field text-xs"
            data-testid="tag-filter"
            placeholder="Filter by tags (comma separated), Enter to apply"
            @keydown.enter.prevent="applyTagFilter"
          />
        </div>

        <ul class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          <li
            v-for="routeEntity in filtered"
            :key="routeEntity.id"
            data-testid="route-row"
            class="cursor-pointer rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
            :class="
              routeEntity.id === selectedId
                ? 'border-accent bg-accent/10 font-medium text-link'
                : 'border-transparent text-ink-muted hover:bg-elevated'
            "
            @click="select(routeEntity)"
          >
            <span class="block truncate font-mono" :title="label(routeEntity)">{{ label(routeEntity) }}</span>
            <span v-if="serviceNameOf(routeEntity)" class="block truncate text-[11px] text-ink-muted">
              {{ serviceNameOf(routeEntity) }}
            </span>
          </li>
        </ul>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No routes.</p>
        <button
          v-if="next"
          type="button"
          class="btn-secondary mx-3 mb-3"
          data-testid="load-more"
          :disabled="loading"
          @click="loadMore"
        >
          Load more
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-6">
        <LiveErrorBanner :messages="validationErrors" :error="error" />
        <div v-if="form" class="max-w-3xl space-y-4">
          <RouteForm
            v-model="form"
            :service-options="serviceOptions"
            :disabled="!connection.canWrite"
            :field-errors="fieldErrors"
          />
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="!creating"
              type="button"
              class="btn-danger-ghost"
              data-testid="delete"
              :disabled="!connection.canWrite || busy"
              @click="remove"
            >
              Delete
            </button>
            <span v-if="dirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              <span class="h-1.5 w-1.5 rounded-full bg-accent" />
              Unsaved changes
            </span>
            <div class="ml-auto flex gap-2">
              <button type="button" class="btn-secondary" data-testid="discard" :disabled="!dirty" @click="discard">
                Discard
              </button>
              <button type="button" class="btn-primary" data-testid="save" :disabled="!canSave" @click="save">
                {{ creating ? 'Create' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="flex h-full min-h-[16rem] items-center justify-center text-center">
          <p class="text-sm text-ink-muted">Select a route from the list, or create a new one.</p>
        </div>
      </div>
    </div>
  </LiveGate>
</template>
