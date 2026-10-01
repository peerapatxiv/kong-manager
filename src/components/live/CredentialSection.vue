<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { newCredentialForm, toCredentialPayload, validateCredential } from '../../lib/live/credentials'
import type { CredentialForm, CredentialType } from '../../lib/live/credentials'
import FieldError from './FieldError.vue'
import AppIcon from '../shared/AppIcon.vue'
import AppSelect from '../shared/AppSelect.vue'
import LiveErrorBanner from './LiveErrorBanner.vue'
import SecretField from '../shared/SecretField.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import ValueListEditor from '../shared/ValueListEditor.vue'

const props = defineProps<{ consumerId: string; type: CredentialType; disabled?: boolean }>()
const emit = defineEmits<{ loaded: [count: number] }>()

const { items, loading, error, load, create, remove } = useLiveEntities<LiveEntity>(props.type.resource, {
  parentId: () => props.consumerId,
})

const form = ref<CredentialForm>(newCredentialForm(props.type))
const validationErrors = ref<string[]>([])
const busy = ref(false)
const revealed = ref<Set<string>>(new Set())

const secretKeys = computed(() => new Set(props.type.fields.filter((f) => f.kind === 'secret').map((f) => f.key)))
const hasSecretSummary = computed(() => props.type.summaryKeys.some((key) => secretKeys.value.has(key)))
const fieldErrors = computed(() =>
  Object.fromEntries(
    Object.entries(error.value?.fields ?? {}).map(([field, problem]) => [
      field,
      typeof problem === 'string' ? problem : JSON.stringify(problem),
    ]),
  ),
)

function summary(item: LiveEntity, key: string): string {
  const value = item[key]
  if (value === null || value === undefined || value === '') return '-'
  if (secretKeys.value.has(key) && !revealed.value.has(item.id)) return '••••••••'
  return String(value)
}

function toggleReveal(id: string) {
  const next = new Set(revealed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  revealed.value = next
}

function setField(key: string, value: string | number | boolean | string[]) {
  form.value = { ...form.value, [key]: value }
}
function inputText(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function inputNumber(event: Event): number | '' {
  const value = inputText(event)
  return value === '' ? '' : Number(value)
}
const textOf = (key: string): string => String(form.value[key] ?? '')

// A field with no default gets an explicit empty choice so it can be left unset.
function selectOptions(field: { options?: readonly string[]; default?: unknown }) {
  const choices = (field.options ?? []).map((option) => ({ value: option, label: option }))
  return field.default === undefined ? [{ value: '', label: '(default)' }, ...choices] : choices
}
const listOf = (key: string): string[] => (Array.isArray(form.value[key]) ? (form.value[key] as string[]) : [])

async function add() {
  const errors = validateCredential(props.type, form.value)
  validationErrors.value = errors
  if (errors.length > 0) return
  busy.value = true
  try {
    await create(toCredentialPayload(props.type, form.value))
    form.value = newCredentialForm(props.type)
  } catch {
    // Shown in the banner; the form keeps what was typed.
  } finally {
    busy.value = false
  }
}

async function removeCredential(id: string) {
  if (!window.confirm('Delete this credential?')) return
  try {
    await remove(id)
  } catch {
    // Shown in the banner.
  }
}

watch(items, (list) => emit('loaded', list.length))
onMounted(() => void load())
</script>

<template>
  <div class="space-y-4">
    <LiveErrorBanner :messages="validationErrors" :error="error" />

    <ul v-if="items.length > 0" class="space-y-1.5">
      <li
        v-for="item in items"
        :key="item.id"
        data-testid="cred-row"
        class="flex items-center gap-3 rounded-xl border border-border bg-elevated/30 px-3 py-2.5 text-sm"
      >
        <div class="min-w-0 flex-1 space-y-0.5">
          <p v-for="key in type.summaryKeys" :key="key" class="truncate font-mono text-xs text-ink">
            <span class="text-ink-muted">{{ key }}:</span> {{ summary(item, key) }}
          </p>
        </div>
        <button
          v-if="hasSecretSummary"
          type="button"
          data-testid="cred-reveal"
          class="btn-secondary btn-sm shrink-0"
          :aria-label="revealed.has(item.id) ? 'Hide credential' : 'Reveal credential'"
          @click="toggleReveal(item.id)"
        >
          <AppIcon :name="revealed.has(item.id) ? 'eye-off' : 'eye'" class="h-3.5 w-3.5" />
          {{ revealed.has(item.id) ? 'Hide' : 'Reveal' }}
        </button>
        <button
          type="button"
          data-testid="cred-delete"
          class="btn-danger-outline btn-sm shrink-0"
          :disabled="disabled"
          @click="removeCredential(item.id)"
        >
          <AppIcon name="trash" class="h-3.5 w-3.5" />
          Delete
        </button>
      </li>
    </ul>
    <p v-else-if="loading" class="text-xs text-ink-muted">Loading…</p>
    <p v-else class="text-xs text-ink-muted">No {{ type.label }} credentials yet.</p>

    <fieldset :disabled="disabled" class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Add {{ type.label }} credential</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div v-for="field in type.fields" :key="field.key" :data-testid="`cred-${field.key}`">
          <ToggleSwitch
            v-if="field.kind === 'boolean'"
            :label="field.label"
            :model-value="form[field.key] === true"
            @update:model-value="(value) => setField(field.key, value)"
          />
          <label v-else class="block">
            <span class="field-label">{{ field.label }}<span v-if="field.required"> *</span></span>
            <input
              v-if="field.kind === 'text'"
              type="text"
              class="input-field"
              :value="textOf(field.key)"
              @input="setField(field.key, inputText($event))"
            />
            <SecretField
              v-else-if="field.kind === 'secret'"
              :model-value="textOf(field.key)"
              placeholder="Leave blank to let Kong generate"
              @update:model-value="(value) => setField(field.key, value)"
            />
            <input
              v-else-if="field.kind === 'number'"
              type="number"
              class="input-field"
              :value="form[field.key] as number | string"
              @input="setField(field.key, inputNumber($event))"
            />
            <AppSelect
              v-else-if="field.kind === 'select'"
              :model-value="textOf(field.key)"
              :options="selectOptions(field)"
              :aria-label="field.label"
              @update:model-value="(value) => setField(field.key, value)"
            />
            <textarea
              v-else-if="field.kind === 'textarea'"
              rows="4"
              class="input-field font-mono text-xs"
              spellcheck="false"
              :value="textOf(field.key)"
              @input="setField(field.key, inputText($event))"
            />
            <ValueListEditor
              v-else-if="field.kind === 'list'"
              :add-label="`Add ${field.label.toLowerCase()}`"
              :placeholder="field.label.toLowerCase()"
              :model-value="listOf(field.key)"
              @update:model-value="(value) => setField(field.key, value)"
            />
            <FieldError :message="fieldErrors[field.key]" />
          </label>
        </div>
      </div>
      <div class="flex justify-end">
        <button
          type="button"
          class="btn-primary"
          data-testid="cred-add"
          :disabled="disabled || busy"
          @click="add"
        >
          Add credential
        </button>
      </div>
    </fieldset>
  </div>
</template>
