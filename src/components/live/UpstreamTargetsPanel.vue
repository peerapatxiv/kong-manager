<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useConnectionStore } from '../../stores/connection'
import { toLiveError } from '../../composables/useLiveEntities'
import type { LiveEntity, LiveError } from '../../composables/useLiveEntities'
import { useUpstreamHealth } from '../../composables/useUpstreamHealth'
import { newTargetForm, targetsByAddress, toTargetPayload, validateTarget } from '../../lib/live/targetForm'
import type { TargetForm } from '../../lib/live/targetForm'
import AppIcon from '../shared/AppIcon.vue'
import TargetHealthBadge from './TargetHealthBadge.vue'

const props = defineProps<{ upstreamId: string }>()

const connection = useConnectionStore()
const history = ref<LiveEntity[]>([])
const loading = ref(false)
const loadError = ref<LiveError | null>(null)
const writeError = ref<LiveError | null>(null)
const formErrors = ref<string[]>([])
const busy = ref(false)
const adding = ref<TargetForm>(newTargetForm())
const weightEdits = reactive<Record<string, number | ''>>({})
let token = 0

const targets = computed(() => targetsByAddress(history.value))
const { health, loading: healthLoading, error: healthError, updatedAt, refresh: refreshHealth } = useUpstreamHealth(
  () => props.upstreamId,
)
const healthByTarget = computed(() => new Map(health.value.map((row) => [row.target, row.health])))
const updatedLabel = computed(() => updatedAt.value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

const client = () => connection.client('targets', props.upstreamId)
const address = (target: LiveEntity) => String(target.target)

async function load() {
  const current = ++token
  loading.value = true
  loadError.value = null
  try {
    const all = await connection.client<LiveEntity>('targets', props.upstreamId).listAll()
    if (current !== token) return
    history.value = all
    for (const key of Object.keys(weightEdits)) delete weightEdits[key]
  } catch (err) {
    if (current === token) {
      history.value = []
      loadError.value = toLiveError(err)
    }
  } finally {
    if (current === token) loading.value = false
  }
}

/** Runs a write, then reloads the targets and their health; a refusal from Kong is shown and nothing else changes. */
async function write(action: () => Promise<unknown>): Promise<boolean> {
  busy.value = true
  writeError.value = null
  formErrors.value = []
  try {
    await action()
  } catch (err) {
    writeError.value = toLiveError(err)
    busy.value = false
    return false
  }
  await Promise.all([load(), refreshHealth()])
  busy.value = false
  return true
}

async function add() {
  const errors = validateTarget(adding.value)
  formErrors.value = errors
  if (errors.length > 0) return
  if (await write(() => client().create(toTargetPayload(adding.value)))) adding.value = newTargetForm()
}

function editWeight(target: LiveEntity, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  weightEdits[address(target)] = raw === '' ? '' : Number(raw)
}

function weightOf(target: LiveEntity): number | '' {
  return weightEdits[address(target)] ?? (typeof target.weight === 'number' ? target.weight : '')
}

function canSetWeight(target: LiveEntity): boolean {
  const edit = weightEdits[address(target)]
  return connection.canWrite && !busy.value && edit !== undefined && edit !== '' && edit !== target.weight
}

// Kong targets are append-only, so a new weight is a new row for the same address.
async function setWeight(target: LiveEntity) {
  const edit = weightEdits[address(target)]
  if (edit === undefined || edit === '') return
  const errors = validateTarget({ target: address(target), weight: edit, tags: [] })
  formErrors.value = errors
  if (errors.length > 0) return
  await write(() => client().create({ target: address(target), weight: edit }))
}

// By address, not row id: deleting one history row could bring an older weight back.
async function remove(target: LiveEntity) {
  if (!window.confirm(`Remove target ${address(target)}?`)) return
  await write(() => client().remove(address(target)))
}

onMounted(load)
watch(
  () => props.upstreamId,
  () => {
    formErrors.value = []
    writeError.value = null
    adding.value = newTargetForm()
    void load()
  },
)
</script>

<template>
  <section class="space-y-3" data-testid="upstream-targets">
    <div class="flex items-center justify-between gap-3">
      <h4 class="section-heading flex items-center gap-2">
        Targets
        <span
          v-if="!loading && !loadError"
          data-testid="upstream-targets-count"
          class="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-accent/15 px-2 text-[11px] font-semibold tabular-nums text-accent-secondary ring-1 ring-inset ring-accent/40 dark:bg-accent/20 dark:text-accent"
        >
          {{ targets.length.toLocaleString('en-US') }}
        </span>
      </h4>
      <div class="flex items-center gap-2">
        <span v-if="updatedLabel" data-testid="health-updated" class="text-xs text-ink-muted">Health as of {{ updatedLabel }}</span>
        <button type="button" class="btn-secondary btn-sm" data-testid="health-refresh" :disabled="healthLoading" @click="refreshHealth">
          <AppIcon name="refresh" class="h-3.5 w-3.5" :class="healthLoading ? 'animate-spin' : ''" />
          Refresh health
        </button>
      </div>
    </div>

    <p v-if="healthError" data-testid="health-error" class="text-xs text-ink-muted">No health data: {{ healthError }}</p>
    <p v-if="writeError" data-testid="target-write-error" role="alert" class="text-xs text-red-700 dark:text-red-300">
      {{ writeError.message }}
    </p>
    <ul v-if="formErrors.length > 0" data-testid="target-errors" role="alert" class="space-y-0.5 text-xs text-red-700 dark:text-red-300">
      <li v-for="message in formErrors" :key="message">{{ message }}</li>
    </ul>

    <p v-if="loading" class="text-xs text-ink-muted">Loading…</p>
    <p v-else-if="loadError" class="text-xs text-red-700 dark:text-red-300">Could not load targets: {{ loadError.message }}</p>
    <p v-else-if="targets.length === 0" class="text-xs text-ink-muted">This upstream has no targets.</p>
    <ul v-else class="space-y-2">
      <li v-for="target in targets" :key="address(target)" data-testid="target-row" class="card flex flex-wrap items-center gap-3 px-3.5 py-2.5">
        <p class="min-w-0 flex-1 truncate font-mono text-sm text-ink" data-testid="target-address" :title="address(target)">
          {{ address(target) }}
        </p>
        <TargetHealthBadge :health="healthByTarget.get(address(target))" />
        <label class="flex items-center gap-1.5 text-xs text-ink-muted">
          Weight
          <input
            type="number"
            min="0"
            max="65535"
            class="input-field !w-24"
            data-testid="target-weight"
            :value="weightOf(target)"
            :disabled="!connection.canWrite"
            @input="editWeight(target, $event)"
          />
        </label>
        <button type="button" class="btn-secondary btn-sm" data-testid="target-set-weight" :disabled="!canSetWeight(target)" @click="setWeight(target)">
          Set weight
        </button>
        <button
          type="button"
          class="btn-secondary btn-sm"
          data-testid="target-delete"
          :aria-label="`Remove ${address(target)}`"
          :disabled="!connection.canWrite || busy"
          @click="remove(target)"
        >
          <AppIcon name="trash" class="h-3.5 w-3.5" />
        </button>
      </li>
    </ul>

    <form v-if="connection.canWrite" class="flex flex-wrap items-end gap-2" @submit.prevent="add">
      <label class="min-w-[12rem] flex-1">
        <span class="field-label">Add target</span>
        <input
          v-model="adding.target"
          type="text"
          class="input-field font-mono"
          data-testid="target-add-input"
          placeholder="host:port"
          spellcheck="false"
        />
      </label>
      <label>
        <span class="field-label">Weight</span>
        <input v-model.number="adding.weight" type="number" min="0" max="65535" class="input-field !w-24" data-testid="target-add-weight" />
      </label>
      <button type="submit" class="btn-primary" data-testid="target-add" :disabled="busy">Add</button>
    </form>
  </section>
</template>
