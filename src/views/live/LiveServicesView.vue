<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newServiceForm, toPayload, validateService } from '../../lib/live/serviceForm'
import type { ServiceForm as ServiceFormModel } from '../../lib/live/serviceForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import ServiceForm from '../../components/live/ServiceForm.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import LiveActionBar from '../../components/live/LiveActionBar.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import DetailHeader from '../../components/shared/DetailHeader.vue'

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
} = useLiveEntities<LiveEntity>('services')

const search = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<ServiceFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

function label(service: LiveEntity): string {
  return typeof service.name === 'string' && service.name ? service.name : `${service.host}:${service.port ?? ''}`
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((service) => {
    const tags = Array.isArray(service.tags) ? (service.tags as string[]) : []
    const haystack = [service.name, service.host, service.path, ...tags].filter(Boolean).join(' ').toLowerCase()
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

function setForm(next: ServiceFormModel | null) {
  form.value = next
  baseline.value = next ? JSON.stringify(next) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(service: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = service.id
  setForm(fromEntity(service))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm(newServiceForm())
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as ServiceFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validateService(form.value)
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
  if (!selectedId.value || !window.confirm('Delete this service?')) return
  try {
    await removeEntity(selectedId.value)
    selectedId.value = null
    setForm(null)
  } catch {
    // Shown in the banner.
  }
}

// Leaving the page would silently drop unsaved edits, so ask first (false cancels).
onBeforeRouteLeave(() => confirmDiscard())

onMounted(() => {
  if (connection.isConnected) void load()
})
watch(
  () => connection.active?.baseUrl,
  (baseUrl) => {
    selectedId.value = null
    setForm(null)
    if (baseUrl) void load()
  },
)
</script>

<template>
  <LiveGate>
    <LiveWorkspace storage-key="kong-config:live-services-panel-width" :has-more="Boolean(next)" :loading="loading" @load-more="loadMore">
      <template #toolbar>
        <LiveListToolbar
          v-model:search="search"
          placeholder="Search loaded services…"
          new-testid="new-service"
          :can-create="connection.canWrite"
          @create="startCreate"
        />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="service in filtered"
            :key="service.id"
            data-testid="service-row"
            :title="label(service)"
            :selected="service.id === selectedId"
            @click="select(service)"
          >
            {{ label(service) }}
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No services.</p>
      </template>

      <template #detail>
        <div class="h-full space-y-4">
          <LiveErrorBanner :messages="validationErrors" :error="error" />
          <div v-if="form" class="space-y-4">
            <div class="card space-y-5 p-5">
              <DetailHeader
                :initial="(form.name || '?').charAt(0)"
                :title="creating ? 'New service' : form.name || 'Service'"
                :subtitle="!creating && selectedId ? selectedId : undefined"
              />
              <ServiceForm v-model="form" :disabled="!connection.canWrite" :field-errors="fieldErrors" />
            </div>
          </div>
          <EmptyState v-else icon="server" title="Select a service from the list, or create a new one." />
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
