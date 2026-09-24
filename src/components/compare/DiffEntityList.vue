<script setup lang="ts" generic="T extends Record<string, unknown>">
import type { EntityDiff } from '../../lib/diff'
import { redactSecrets } from '../../lib/redact'
import DiffField from './DiffField.vue'

defineProps<{ title: string; diff: EntityDiff<T>; entityLabel: (entity: T) => string }>()
</script>

<template>
  <div class="card space-y-4 p-4">
    <h3 class="font-bold text-ink">{{ title }}</h3>

    <div v-if="diff.added.length > 0" class="border-l-2 border-emerald-400 pl-3">
      <h4 class="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">Added</h4>
      <ul class="space-y-0.5 text-sm">
        <li v-for="(entity, i) in diff.added" :key="i" class="font-mono">{{ entityLabel(entity) }}</li>
      </ul>
    </div>

    <div v-if="diff.removed.length > 0" class="border-l-2 border-red-400 pl-3">
      <h4 class="mb-1 text-xs font-medium uppercase tracking-wide text-red-700">Removed</h4>
      <ul class="space-y-0.5 text-sm">
        <li v-for="(entity, i) in diff.removed" :key="i" class="font-mono">{{ entityLabel(entity) }}</li>
      </ul>
    </div>

    <div v-if="diff.changed.length > 0" class="space-y-2 border-l-2 border-blue-400 pl-3">
      <h4 class="mb-1 text-xs font-medium uppercase tracking-wide text-blue-700">Changed</h4>
      <div v-for="entry in diff.changed" :key="entry.key" class="rounded-lg bg-elevated p-2.5 space-y-1">
        <p class="font-mono text-sm">{{ entry.key }}</p>
        <DiffField
          v-for="change in entry.changes"
          :key="change.path"
          :path="change.path"
          :before="change.before"
          :after="change.after"
        />
      </div>
    </div>

    <div v-if="diff.unmatchedA.length > 0 || diff.unmatchedB.length > 0" class="border-l-2 border-amber-400 pl-3">
      <h4 class="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">Unmatched (no natural key)</h4>
      <ul class="space-y-0.5 text-sm">
        <li v-for="(entity, i) in diff.unmatchedA" :key="`a-${i}`" class="font-mono">
          File A: {{ JSON.stringify(redactSecrets(entity)) }}
        </li>
        <li v-for="(entity, i) in diff.unmatchedB" :key="`b-${i}`" class="font-mono">
          File B: {{ JSON.stringify(redactSecrets(entity)) }}
        </li>
      </ul>
    </div>
  </div>
</template>
