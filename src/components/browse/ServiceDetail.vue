<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { KongService, KongRoute } from '../../types/kong'
import TagInput from '../shared/TagInput.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import YamlCodeEditor from '../shared/YamlCodeEditor.vue'
import RouteCard from './RouteCard.vue'
import { parseYamlEntity, dumpYamlEntity } from '../../lib/yaml'

const props = defineProps<{ modelValue: KongService }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongService]; modified: [] }>()

// structuredClone chokes on Vue's reactive Proxy wrapper around modelValue
// (a Pinia-store-backed object) — a JSON round-trip clones the same plain
// data (this config is always JSON-safe, parsed straight from YAML) without
// touching the proxy machinery.
function cloneEntity(entity: KongService): KongService {
  return JSON.parse(JSON.stringify(entity))
}

const mode = ref<'form' | 'code'>('form')
const codeDraft = ref('')
const codeDraftOriginal = ref('')
const justSaved = ref(false)

// The working copy every field edits — nothing reaches the parent (and so
// the store) until saveEntity() runs. draftBaseline is the last-committed
// snapshot, used both to detect unsaved edits and to restore on discard.
const draft = ref<KongService>(cloneEntity(props.modelValue))
const draftBaseline = ref<KongService>(cloneEntity(props.modelValue))

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(draftBaseline.value))

// Selecting a different service should always land back on the form view
// with a fresh draft — a stale draft or code text for the previous entity
// would otherwise leak through. Our own saves round-trip back through this
// same prop with an unchanged name, so this only fires on a real selection
// change.
watch(
  () => props.modelValue.name,
  () => {
    mode.value = 'form'
    draft.value = cloneEntity(props.modelValue)
    draftBaseline.value = cloneEntity(props.modelValue)
  },
)

const codeValidity = computed((): { valid: true } | { valid: false; error: string } => {
  try {
    parseYamlEntity(codeDraft.value)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// Whether the YAML text actually differs from what Code mode started with —
// distinct from codeValidity, so Save stays disabled on a no-op open/close
// even though the (unedited) text is trivially valid.
const codeIsDirty = computed(() => codeDraft.value !== codeDraftOriginal.value)

function update<K extends keyof KongService>(key: K, value: KongService[K]) {
  draft.value = { ...draft.value, [key]: value }
}

function onRouteUpdate(index: number, updated: KongRoute) {
  const routes = [...(draft.value.routes ?? [])]
  routes[index] = updated
  update('routes', routes)
}

function enterCodeMode() {
  codeDraft.value = dumpYamlEntity(draft.value)
  codeDraftOriginal.value = codeDraft.value
  mode.value = 'code'
}

function cancelCodeEdit() {
  if (codeIsDirty.value && !window.confirm('Discard your unsaved changes?')) return
  mode.value = 'form'
}

// Commits the working draft to the parent (and so the store) — the one
// place either Save button ends up.
function commitDraft() {
  emit('update:modelValue', draft.value)
  emit('modified')
  draftBaseline.value = cloneEntity(draft.value)
  justSaved.value = true
  setTimeout(() => (justSaved.value = false), 1600)
}

function saveEntity() {
  commitDraft()
}

// Code mode's Save works exactly like the form's: parse the YAML into the
// draft and commit it immediately, in one step.
function saveFromCode() {
  if (!codeValidity.value.valid || !codeIsDirty.value) return
  draft.value = parseYamlEntity(codeDraft.value) as KongService
  mode.value = 'form'
  commitDraft()
}

function discardEntity() {
  if (isDirty.value && !window.confirm('Discard your unsaved changes?')) return
  draft.value = cloneEntity(draftBaseline.value)
}
</script>

<template>
  <div class="card max-w-5xl space-y-6 p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-mono text-lg font-bold text-ink">{{ draft.name ?? '(unnamed service)' }}</h2>
        <div class="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <span>Read-only here — switch to Code to rename.</span>
          <Transition
            enter-active-class="transition duration-150"
            enter-from-class="opacity-0 -translate-y-0.5"
            leave-active-class="transition duration-150"
            leave-to-class="opacity-0"
          >
            <span
              v-if="justSaved"
              class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-secondary dark:bg-accent/20 dark:text-accent"
            >
              <svg viewBox="0 0 16 16" fill="none" class="h-3 w-3">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Saved
            </span>
            <span v-else-if="isDirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              <span class="h-1.5 w-1.5 rounded-full bg-accent" />
              Unsaved changes
            </span>
          </Transition>
        </div>
      </div>

      <div class="inline-flex h-9 items-center gap-0.5 rounded-full bg-elevated p-1" role="tablist" aria-label="Editing mode">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'form'"
          class="h-full rounded-full px-3.5 text-xs font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
          :class="
            mode === 'form'
              ? 'bg-surface text-ink shadow-sm ring-1 ring-border font-semibold'
              : 'text-ink-muted hover:text-ink'
          "
          @click="mode = 'form'"
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'code'"
          class="h-full rounded-full px-3.5 text-xs font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
          :class="
            mode === 'code'
              ? 'bg-surface text-ink shadow-sm ring-1 ring-border font-semibold'
              : 'text-ink-muted hover:text-ink'
          "
          @click="enterCodeMode"
        >
          Code
        </button>
      </div>
    </div>

    <template v-if="mode === 'code'">
      <YamlCodeEditor v-model="codeDraft" :invalid="!codeValidity.valid" />
      <p
        v-if="!codeValidity.valid"
        class="rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
      >
        Failed to parse YAML: {{ codeValidity.error }}
      </p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="cancelCodeEdit">Cancel</button>
        <button type="button" class="btn-primary" :disabled="!codeValidity.valid || !codeIsDirty" @click="saveFromCode">Save</button>
      </div>
    </template>

    <template v-else>
      <section class="space-y-3">
        <h3 class="section-heading">Connection</h3>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label class="md:col-span-3">
            <span class="field-label">Host</span>
            <input
              type="text"
              :value="draft.host"
              class="input-field"
              @input="update('host', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="md:col-span-1">
            <span class="field-label">Port</span>
            <input
              type="number"
              :value="draft.port"
              class="input-field"
              @input="update('port', Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <label class="md:col-span-1">
            <span class="field-label">Protocol</span>
            <input
              type="text"
              :value="draft.protocol"
              class="input-field"
              @input="update('protocol', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="md:col-span-3">
            <span class="field-label">Path</span>
            <input
              type="text"
              :value="draft.path ?? ''"
              class="input-field"
              placeholder="/"
              @input="update('path', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </section>

      <section class="space-y-3 border-t border-border pt-5">
        <h3 class="section-heading">Timeouts &amp; Retries</h3>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label>
            <span class="field-label">Connect timeout</span>
            <input
              type="number"
              :value="draft.connect_timeout"
              class="input-field"
              @input="update('connect_timeout', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="field-help">Time Kong waits to establish a connection, in ms.</span>
          </label>
          <label>
            <span class="field-label">Read timeout</span>
            <input
              type="number"
              :value="draft.read_timeout"
              class="input-field"
              @input="update('read_timeout', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="field-help">Time Kong waits for a response, in ms.</span>
          </label>
          <label>
            <span class="field-label">Write timeout</span>
            <input
              type="number"
              :value="draft.write_timeout"
              class="input-field"
              @input="update('write_timeout', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="field-help">Time Kong waits to send data upstream, in ms.</span>
          </label>
          <label>
            <span class="field-label">Retries</span>
            <input
              type="number"
              :value="draft.retries"
              class="input-field"
              @input="update('retries', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="field-help">Retry attempts before giving up on the upstream.</span>
          </label>
        </div>
      </section>

      <section class="space-y-3 border-t border-border pt-5">
        <h3 class="section-heading">Status</h3>
        <ToggleSwitch
          :model-value="draft.enabled ?? true"
          label="Service enabled"
          show-status
          @update:model-value="(v) => update('enabled', v)"
        />
      </section>

      <section class="space-y-2 border-t border-border pt-5">
        <h3 class="section-heading">Tags</h3>
        <TagInput :model-value="draft.tags" @update:model-value="(v) => update('tags', v)" />
      </section>

      <section v-if="(draft.routes ?? []).length > 0" class="space-y-2 border-t border-border pt-5">
        <h3 class="section-heading">Routes</h3>
        <div class="space-y-2">
          <RouteCard
            v-for="(route, index) in draft.routes"
            :key="route.name ?? index"
            :model-value="route"
            :service-name="draft.name ?? ''"
            @update:model-value="(v) => onRouteUpdate(index, v)"
            @modified="update('routes', draft.routes)"
          />
        </div>
      </section>

      <div class="flex justify-end gap-2 border-t border-border pt-5">
        <button type="button" class="btn-secondary" :disabled="!isDirty" @click="discardEntity">Discard</button>
        <button type="button" class="btn-primary" :disabled="!isDirty" @click="saveEntity">Save</button>
      </div>
    </template>
  </div>
</template>
