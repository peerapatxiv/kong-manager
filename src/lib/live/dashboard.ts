type Entity = Record<string, unknown>
import type { TargetHealth } from '../kongAdmin/health'

export type ServiceSummary = { total: number; enabled: number; disabled: number }
export type LabelCount = { label: string; count: number }
export type PluginCount = { name: string; count: number }
export type NodeStatus = {
  databaseReachable: boolean | undefined
  totalRequests: number | undefined
  activeConnections: number | undefined
}

/** A service with no `enabled` flag counts as enabled, as Kong does. */
export function summarizeServices(services: Entity[]): ServiceSummary {
  const disabled = services.filter((service) => service.enabled === false).length
  return { total: services.length, enabled: services.length - disabled, disabled }
}

/** How many routes serve each protocol; a route serving two is counted under both. */
export function countRouteProtocols(routes: Entity[]): LabelCount[] {
  const counts = new Map<string, number>()
  for (const route of routes) {
    if (!Array.isArray(route.protocols)) continue
    for (const protocol of route.protocols) {
      if (typeof protocol === 'string') counts.set(protocol, (counts.get(protocol) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** The most used plugins by name, counting each instance (global, per service, per route). */
export function topPlugins(plugins: Entity[], limit = 6): PluginCount[] {
  const counts = new Map<string, number>()
  for (const plugin of plugins) {
    if (typeof plugin.name === 'string' && plugin.name) counts.set(plugin.name, (counts.get(plugin.name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

/** Reads Kong's `/status` response, leaving out anything the node did not report. */
export function parseNodeStatus(raw: unknown): NodeStatus | null {
  if (typeof raw !== 'object' || raw === null) return null
  const body = raw as { database?: { reachable?: unknown }; server?: Record<string, unknown> }
  return {
    databaseReachable: typeof body.database?.reachable === 'boolean' ? body.database.reachable : undefined,
    totalRequests: asNumber(body.server?.total_requests),
    activeConnections: asNumber(body.server?.connections_active),
  }
}

export type UpstreamHealthSummary = { upstreams: number; targets: number; unhealthy: number; unknown: number }

const UNHEALTHY_STATES = ['UNHEALTHY', 'DNS_ERROR']

/**
 * Rolls per-upstream health up for the dashboard. `null` stands for an upstream whose request
 * failed: it counts as one unknown and adds no targets.
 */
export function summarizeUpstreamHealth(results: (TargetHealth[] | null)[]): UpstreamHealthSummary {
  const summary: UpstreamHealthSummary = { upstreams: results.length, targets: 0, unhealthy: 0, unknown: 0 }
  for (const result of results) {
    if (result === null) {
      summary.unknown += 1
      continue
    }
    for (const row of result) {
      summary.targets += 1
      if (row.health !== undefined && UNHEALTHY_STATES.includes(row.health)) summary.unhealthy += 1
      else if (row.health !== 'HEALTHY') summary.unknown += 1
    }
  }
  return summary
}

/** Maps `items` through `fn` with at most `limit` calls running at once; results keep the input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
