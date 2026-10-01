import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { adminJson } from '../lib/kongAdmin/http'
import type { EntityResourceName } from '../lib/kongAdmin/entities'
import { parseNodeStatus } from '../lib/live/dashboard'
import type { NodeStatus } from '../lib/live/dashboard'
import { toLiveError } from './useLiveEntities'
import type { LiveEntity } from './useLiveEntities'
import { useConnectionStore } from '../stores/connection'

export type Section<T> = { data: T | null; loading: boolean; error: string | null }

// Kong caps a page at 1000 entities, so this keeps the number of requests as low as it can be.
const PAGE_SIZE = 1000

const idle = <T>(): Section<T> => ({ data: null, loading: false, error: null })

/**
 * The numbers behind the Overview dashboard. Each list and the node status load on their
 * own, so one failing request leaves the others on screen. Only the newest refresh may
 * write results; an older, slower one is dropped.
 */
export function useLiveDashboard() {
  const connection = useConnectionStore()

  const services = ref(idle<LiveEntity[]>()) as Ref<Section<LiveEntity[]>>
  const routes = ref(idle<LiveEntity[]>()) as Ref<Section<LiveEntity[]>>
  const consumers = ref(idle<LiveEntity[]>()) as Ref<Section<LiveEntity[]>>
  const plugins = ref(idle<LiveEntity[]>()) as Ref<Section<LiveEntity[]>>
  const node = ref(idle<NodeStatus | null>()) as Ref<Section<NodeStatus | null>>
  const updatedAt = ref<Date | null>(null)
  let token = 0

  const loading = computed(() =>
    [services, routes, consumers, plugins, node].some((section) => section.value.loading),
  )

  async function load<T>(target: Ref<Section<T>>, mine: number, run: () => Promise<T>) {
    target.value = { ...target.value, loading: true, error: null }
    try {
      const data = await run()
      if (mine === token) target.value = { data, loading: false, error: null }
    } catch (err) {
      if (mine === token) target.value = { data: null, loading: false, error: toLiveError(err).message }
    }
  }

  const list = (resource: EntityResourceName) => () => connection.client(resource).listAll({ size: PAGE_SIZE }) as Promise<LiveEntity[]>

  async function refresh() {
    const mine = ++token
    await Promise.all([
      load(services, mine, list('services')),
      load(routes, mine, list('routes')),
      load(consumers, mine, list('consumers')),
      load(plugins, mine, list('plugins')),
      load(node, mine, async () => {
        if (!connection.active) throw new Error('Not connected to a Kong Admin API')
        return parseNodeStatus(await adminJson<unknown>(connection.active, 'GET', '/status'))
      }),
    ])
    if (mine === token) updatedAt.value = new Date()
  }

  return { services, routes, consumers, plugins, node, updatedAt, loading, refresh }
}
