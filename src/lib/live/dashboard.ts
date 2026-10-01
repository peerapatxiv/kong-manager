type Entity = Record<string, unknown>

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
