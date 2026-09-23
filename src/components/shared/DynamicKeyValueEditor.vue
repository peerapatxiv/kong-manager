<script setup lang="ts">
import { ref } from 'vue'
import { inferValueType } from '../../lib/valueType'
import { isSecretField } from '../../lib/secretFields'
import TagInput from './TagInput.vue'
import SecretField from './SecretField.vue'

const props = defineProps<{ modelValue: Record<string, unknown> }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

const newKeyDraft = ref('')

// Keys that were null when this editor first saw them stay on the nullable
// text widget for the rest of the edit, even once the user has typed a
// non-empty value into it (which makes inferValueType see a plain string).
// Without this, typing a single character swaps the field to a different
// v-if branch — a different DOM node — dropping keyboard focus after every
// keystroke.
const nullableKeys = ref<Set<string>>(
  new Set(Object.keys(props.modelValue).filter((key) => props.modelValue[key] === null)),
)

function isNullable(key: string): boolean {
  return nullableKeys.value.has(key)
}

function setField(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function removeField(key: string) {
  const next = { ...props.modelValue }
  delete next[key]
  nullableKeys.value.delete(key)
  emit('update:modelValue', next)
}

function addField() {
  const key = newKeyDraft.value.trim()
  if (!key || key in props.modelValue) return
  setField(key, '')
  newKeyDraft.value = ''
}

function onNullableTextInput(key: string, raw: string) {
  setField(key, raw === '' ? null : raw)
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="(value, key) in modelValue" :key="key" class="flex items-start gap-2">
      <label class="w-40 shrink-0 text-xs font-mono text-slate-500 pt-1.5 truncate" :title="String(key)">
        {{ key }}
      </label>

      <div class="flex-1">
        <SecretField
          v-if="isSecretField(String(key)) && typeof value === 'string'"
          :model-value="value"
          @update:model-value="(v) => setField(String(key), v)"
        />
        <input
          v-else-if="isNullable(String(key))"
          type="text"
          value=""
          placeholder="null"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm text-slate-400"
          @input="onNullableTextInput(String(key), ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'string'"
          type="text"
          :value="value as string"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="setField(String(key), ($event.target as HTMLInputElement).value)"
        />
        <textarea
          v-else-if="inferValueType(String(key), value) === 'multiline-string'"
          :value="value as string"
          rows="4"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm font-mono"
          @input="setField(String(key), ($event.target as HTMLTextAreaElement).value)"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'number'"
          type="number"
          :value="value as number"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="setField(String(key), Number(($event.target as HTMLInputElement).value))"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'boolean'"
          type="checkbox"
          :checked="value as boolean"
          class="h-4 w-4"
          @change="setField(String(key), ($event.target as HTMLInputElement).checked)"
        />
        <TagInput
          v-else-if="inferValueType(String(key), value) === 'string-array'"
          :model-value="value as string[]"
          @update:model-value="(v) => setField(String(key), v)"
        />
        <div v-else-if="inferValueType(String(key), value) === 'object-array'" class="space-y-2 border-l-2 border-slate-200 pl-3">
          <div v-for="(item, i) in value as Record<string, unknown>[]" :key="i">
            <DynamicKeyValueEditor
              :model-value="item"
              @update:model-value="
                (v) => {
                  const next = [...(value as Record<string, unknown>[])]
                  next[i] = v
                  setField(String(key), next)
                }
              "
            />
          </div>
        </div>
        <div v-else class="border-l-2 border-slate-200 pl-3">
          <DynamicKeyValueEditor
            :model-value="value as Record<string, unknown>"
            @update:model-value="(v) => setField(String(key), v)"
          />
        </div>
      </div>

      <button type="button" class="text-slate-400 hover:text-red-600 text-xs pt-1.5" @click="removeField(String(key))">
        remove
      </button>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <input
        v-model="newKeyDraft"
        type="text"
        placeholder="new key…"
        class="border border-slate-300 rounded px-2 py-1 text-xs w-40"
        @keydown.enter.prevent="addField"
      />
      <button type="button" class="text-xs text-slate-600 hover:text-slate-900 underline" @click="addField">
        add key
      </button>
    </div>
  </div>
</template>
