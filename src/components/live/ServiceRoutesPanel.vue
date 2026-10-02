<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useConnectionStore } from '../../stores/connection'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { toLiveError } from '../../composables/useLiveEntities'
import type { LiveError } from '../../composables/useLiveEntities'
import AppIcon from '../shared/AppIcon.vue'

const props = defineProps<{ serviceId: string }>()

const connection = useConnectionStore()
const routes = ref<LiveEntity[]>([])
const expanded = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref<LiveError | null>(null)
let token = 0

async function load() {
  const current = ++token
  loading.value = true
  error.value = null
  routes.value = []
  expanded.value = new Set()
  try {
    const all = await connection.client<LiveEntity>('service_routes', props.serviceId).listAll()
    if (current === token) routes.value = all
  } catch (err) {
    if (current === token) error.value = toLiveError(err)
  } finally {
    if (current === token) loading.value = false
  }
}

function label(route: LiveEntity): string {
  if (typeof route.name === 'string' && route.name) return route.name
  const paths = Array.isArray(route.paths) ? (route.paths as string[]) : []
  return paths[0] ?? route.id
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

// Same one-line summary the file-mode route cards show: paths · methods · protocols.
function summary(route: LiveEntity): string {
  const parts: string[] = []
  const paths = list(route.paths)
  if (paths.length > 0) parts.push(paths.length === 1 ? paths[0] : `${paths.length} paths`)
  const methods = list(route.methods)
  if (methods.length > 0) parts.push(methods.join(', '))
  const protocols = list(route.protocols)
  if (protocols.length > 0) parts.push(protocols.join('/'))
  return parts.join(' · ')
}

function details(route: LiveEntity): { label: string; value: string }[] {
  const rows = [
    { label: 'Hosts', value: list(route.hosts).join(', ') },
    { label: 'Paths', value: list(route.paths).join(', ') },
    { label: 'Methods', value: list(route.methods).join(', ') },
    { label: 'Protocols', value: list(route.protocols).join(', ') },
    { label: 'Path handling', value: typeof route.path_handling === 'string' ? route.path_handling : '' },
    { label: 'strip_path', value: route.strip_path === undefined ? '' : String(route.strip_path) },
    { label: 'preserve_host', value: route.preserve_host === undefined ? '' : String(route.preserve_host) },
    { label: 'Tags', value: list(route.tags).join(', ') },
  ]
  return rows.filter((row) => row.value !== '')
}

function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

onMounted(load)
watch(() => props.serviceId, load)
</script>

<template>
  <section class="space-y-3" data-testid="service-routes">
    <div class="flex items-center justify-between gap-3">
      <h4 class="section-heading flex items-center gap-2">
        Routes
        <span
          v-if="!loading && !error"
          data-testid="service-routes-count"
          class="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-accent/15 px-2 text-[11px] font-semibold tabular-nums text-accent-secondary ring-1 ring-inset ring-accent/40 dark:bg-accent/20 dark:text-accent"
        >
          {{ routes.length.toLocaleString('en-US') }}
        </span>
      </h4>
      <RouterLink
        :to="{ path: '/live/routes', query: { service: serviceId } }"
        class="btn-secondary btn-sm"
      >
        Open in Routes
        <AppIcon name="chevron-right" class="h-3.5 w-3.5" />
      </RouterLink>
    </div>

    <p v-if="loading" class="text-xs text-ink-muted">Loading…</p>
    <p v-else-if="error" class="text-xs text-red-700 dark:text-red-300">Could not load routes: {{ error.message }}</p>
    <p v-else-if="routes.length === 0" class="text-xs text-ink-muted">No routes use this service.</p>
    <div v-else class="space-y-2">
      <div v-for="route in routes" :key="route.id" data-testid="service-route" class="card overflow-hidden">
        <button
          type="button"
          class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-elevated"
          :aria-expanded="expanded.has(route.id)"
          @click="toggle(route.id)"
        >
          <AppIcon
            name="chevron-right"
            class="h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform duration-150"
            :class="expanded.has(route.id) ? 'rotate-90' : ''"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate font-mono text-sm text-ink" :title="label(route)">{{ label(route) }}</p>
            <p class="mt-0.5 truncate text-xs text-ink-muted">{{ summary(route) }}</p>
          </div>
          <span class="shrink-0 text-xs font-medium text-accent-secondary">
            {{ expanded.has(route.id) ? 'collapse' : 'expand' }}
          </span>
        </button>
        <dl v-if="expanded.has(route.id)" class="space-y-2 border-t border-border bg-elevated/60 p-4 text-sm">
          <div v-for="row in details(route)" :key="row.label" class="grid grid-cols-[8rem_1fr] gap-2">
            <dt class="field-label !mb-0">{{ row.label }}</dt>
            <dd class="break-all font-mono text-ink">{{ row.value }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
