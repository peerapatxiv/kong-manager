<script setup lang="ts" generic="T extends Record<string, unknown>">
import type { EntityDiff } from '../../lib/diff'
import DiffField from './DiffField.vue'

defineProps<{ title: string; diff: EntityDiff<T>; entityLabel: (entity: T) => string }>()
</script>

<template>
  <div class="space-y-3">
    <h3 class="font-medium text-slate-800">{{ title }}</h3>

    <div v-if="diff.added.length > 0">
      <h4 class="text-xs uppercase tracking-wide text-emerald-700 mb-1">Added</h4>
      <ul class="text-sm space-y-0.5">
        <li v-for="(entity, i) in diff.added" :key="i" class="font-mono">{{ entityLabel(entity) }}</li>
      </ul>
    </div>

    <div v-if="diff.removed.length > 0">
      <h4 class="text-xs uppercase tracking-wide text-red-700 mb-1">Removed</h4>
      <ul class="text-sm space-y-0.5">
        <li v-for="(entity, i) in diff.removed" :key="i" class="font-mono">{{ entityLabel(entity) }}</li>
      </ul>
    </div>

    <div v-if="diff.changed.length > 0" class="space-y-2">
      <h4 class="text-xs uppercase tracking-wide text-blue-700 mb-1">Changed</h4>
      <div v-for="entry in diff.changed" :key="entry.key" class="border border-slate-200 rounded p-2 space-y-1">
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

    <div v-if="diff.unmatchedA.length > 0 || diff.unmatchedB.length > 0">
      <h4 class="text-xs uppercase tracking-wide text-amber-700 mb-1">Unmatched (no natural key)</h4>
      <ul class="text-sm space-y-0.5">
        <li v-for="(entity, i) in diff.unmatchedA" :key="`a-${i}`" class="font-mono">File A: {{ JSON.stringify(entity) }}</li>
        <li v-for="(entity, i) in diff.unmatchedB" :key="`b-${i}`" class="font-mono">File B: {{ JSON.stringify(entity) }}</li>
      </ul>
    </div>

    <p
      v-if="
        diff.added.length === 0 &&
        diff.removed.length === 0 &&
        diff.changed.length === 0 &&
        diff.unmatchedA.length === 0 &&
        diff.unmatchedB.length === 0
      "
      class="text-sm text-slate-400"
    >
      No differences.
    </p>
  </div>
</template>
