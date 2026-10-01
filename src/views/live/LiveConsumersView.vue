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
import SearchInput from '../../components/shared/SearchInput.vue'

const connection = useConnectionStore()
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
} = useLiveEntities<LiveEntity>('consumers')

const search = ref('')
const tagText = ref('')
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

function applyTagFilter() {
  tagFilter.value = tagText.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  void load()
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
    <div class="flex flex-1 flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      <div
        class="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-80 lg:border-b-0 lg:border-r"
        data-testid="live-list-panel"
      >
        <div class="space-y-2 p-3">
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <SearchInput v-model="search" placeholder="Search loaded consumers…" />
            </div>
            <button
              type="button"
              class="btn-primary"
              data-testid="new-consumer"
              :disabled="!connection.canWrite"
              @click="startCreate"
            >
              New
            </button>
          </div>
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
            v-for="consumer in filtered"
            :key="consumer.id"
            data-testid="consumer-row"
            class="flex cursor-pointer items-center gap-2.5 rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
            :class="
              consumer.id === selectedId
                ? 'border-accent bg-accent/10 font-medium text-link'
                : 'border-transparent text-ink-muted hover:bg-elevated'
            "
            @click="select(consumer)"
          >
            <span
              aria-hidden="true"
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-semibold uppercase text-ink-muted"
              :class="consumer.id === selectedId ? '!bg-accent !text-accent-on' : ''"
            >
              {{ label(consumer).charAt(0) }}
            </span>
            <span class="block min-w-0 flex-1 truncate font-mono" :title="label(consumer)">{{ label(consumer) }}</span>
          </li>
        </ul>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No consumers.</p>
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
          <div class="card space-y-5 p-5">
            <div class="flex items-center gap-3">
              <span
                aria-hidden="true"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold uppercase text-accent-on"
              >
                {{ creating ? '+' : (form.username || form.custom_id || '?').charAt(0) }}
              </span>
              <div class="min-w-0">
                <p class="truncate font-semibold text-ink">{{ creating ? 'New consumer' : form.username || form.custom_id || 'Consumer' }}</p>
                <p v-if="!creating && selectedId" class="truncate font-mono text-xs text-ink-muted">{{ selectedId }}</p>
              </div>
            </div>
            <ConsumerForm v-model="form" :disabled="!connection.canWrite" :field-errors="fieldErrors" />
          </div>
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
          <div v-if="!creating && selectedId" class="card p-5">
            <CredentialsPanel
              :key="selectedId"
              :consumer-id="selectedId"
              :disabled="!connection.canWrite"
              class="!border-t-0 !pt-0"
            />
          </div>
        </div>
        <div v-else class="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-center">
          <span class="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-link">
            <svg viewBox="0 0 20 20" fill="none" class="h-6 w-6">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <path d="M4 17a6 6 0 0112 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </span>
          <p class="text-sm text-ink-muted">Select a consumer from the list, or create a new one.</p>
        </div>
      </div>
    </div>
  </LiveGate>
</template>
