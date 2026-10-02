<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useConnectionStore } from '../../stores/connection'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { toLiveError } from '../../composables/useLiveEntities'
import type { LiveError } from '../../composables/useLiveEntities'
import { summarizeRoute } from '../../lib/live/routeSummary'

const props = defineProps<{ serviceId: string }>()

const connection = useConnectionStore()
const routes = ref<LiveEntity[]>([])
const loading = ref(false)
const error = ref<LiveError | null>(null)
let token = 0

async function load() {
  const current = ++token
  loading.value = true
  error.value = null
  routes.value = []
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
          class="rounded-full bg-elevated px-1.5 text-[10px] font-semibold tabular-nums text-ink-muted"
        >
          {{ routes.length }}
        </span>
      </h4>
      <RouterLink
        :to="{ path: '/live/routes', query: { service: serviceId } }"
        class="text-xs font-medium text-accent-secondary hover:underline"
      >
        Open in Routes
      </RouterLink>
    </div>

    <p v-if="loading" class="text-xs text-ink-muted">Loading…</p>
    <p v-else-if="error" class="text-xs text-red-700 dark:text-red-300">Could not load routes: {{ error.message }}</p>
    <p v-else-if="routes.length === 0" class="text-xs text-ink-muted">No routes use this service.</p>
    <ul v-else class="space-y-1.5">
      <li
        v-for="route in routes"
        :key="route.id"
        data-testid="service-route"
        class="flex items-center gap-2 rounded-lg border border-border bg-elevated/60 px-3 py-2 text-sm"
      >
        <span class="min-w-0 truncate font-mono text-ink" :title="label(route)">{{ label(route) }}</span>
        <span class="ml-auto flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
          <span
            v-for="method in summarizeRoute(route).methods"
            :key="method"
            class="shrink-0 rounded bg-surface px-1 py-px font-mono text-[10px] font-semibold uppercase tracking-wide"
          >
            {{ method }}
          </span>
          <span v-if="summarizeRoute(route).moreMethods > 0" class="shrink-0">+{{ summarizeRoute(route).moreMethods }}</span>
          <span class="min-w-0 truncate font-mono">{{ summarizeRoute(route).target }}</span>
          <span v-if="summarizeRoute(route).moreTargets > 0" class="shrink-0">+{{ summarizeRoute(route).moreTargets }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>
