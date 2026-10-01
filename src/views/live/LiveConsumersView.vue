<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newConsumerForm, toPayload, validateConsumer } from '../../lib/live/consumerForm'
import type { ConsumerForm as ConsumerFormModel } from '../../lib/live/consumerForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import ConsumerForm from '../../components/live/ConsumerForm.vue'
import CredentialsPanel from '../../components/live/CredentialsPanel.vue'
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
} = useLiveEntities<LiveEntity>('consumers')

const search = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<ConsumerFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

function label(consumer: LiveEntity): string {
  if (typeof consumer.username === 'string' && consumer.username) return consumer.username
  if (typeof consumer.custom_id === 'string' && consumer.custom_id) return consumer.custom_id
  return consumer.id.slice(0, 8)
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((consumer) => {
    const tags = Array.isArray(consumer.tags) ? (consumer.tags as string[]) : []
    const haystack = [consumer.username, consumer.custom_id, ...tags].filter(Boolean).join(' ').toLowerCase()
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

function setForm(next: ConsumerFormModel | null) {
  form.value = next
  baseline.value = next ? JSON.stringify(next) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(consumer: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = consumer.id
  setForm(fromEntity(consumer))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm(newConsumerForm())
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as ConsumerFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validateConsumer(form.value)
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
  if (!selectedId.value || !window.confirm('Delete this consumer? Its credentials are deleted too.')) return
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
    <LiveWorkspace storage-key="kong-config:live-consumers-panel-width" :has-more="Boolean(next)" :loading="loading" @load-more="loadMore">
      <template #toolbar>
        <LiveListToolbar
          v-model:search="search"
          placeholder="Search loaded consumers…"
          new-testid="new-consumer"
          noun="consumer"
          :count="filtered.length"
          :loading="loading"
          :can-create="connection.canWrite"
          @create="startCreate"
        />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="consumer in filtered"
            :key="consumer.id"
            data-testid="consumer-row"
            :title="label(consumer)"
            :selected="consumer.id === selectedId"
            :initial="label(consumer).charAt(0)"
            @click="select(consumer)"
          >
            {{ label(consumer) }}
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No consumers.</p>
      </template>

      <template #detail>
        <div class="h-full space-y-4">
          <LiveErrorBanner :messages="validationErrors" :error="error" />
          <div v-if="form" class="space-y-4">
            <div class="card space-y-5 p-5">
              <DetailHeader
                :initial="creating ? '+' : (form.username || form.custom_id || '?').charAt(0)"
                :title="creating ? 'New consumer' : form.username || form.custom_id || 'Consumer'"
                :subtitle="!creating && selectedId ? selectedId : undefined"
              />
              <ConsumerForm v-model="form" :disabled="!connection.canWrite" :field-errors="fieldErrors" />
            </div>
            <div v-if="!creating && selectedId" class="card p-5">
              <CredentialsPanel
                :key="selectedId"
                :consumer-id="selectedId"
                :disabled="!connection.canWrite"
                class="!border-t-0 !pt-0"
              />
            </div>
          </div>
          <EmptyState v-else icon="user" title="Select a consumer from the list, or create a new one." />
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
