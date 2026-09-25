import type { KongConfig, KongConsumer, KongPlugin, KongRoute, KongService } from '../types/kong'

const BOOKKEEPING_KEYS = ['id', 'created_at', 'updated_at']

function stripKeys(entity: Record<string, unknown>, extraKeys: string[]): Record<string, unknown> {
  const drop = new Set([...BOOKKEEPING_KEYS, ...extraKeys])
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity)) {
    if (!drop.has(key)) result[key] = value
  }
  return result
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

// Kong's GET /config returns routes/credentials/scoped-plugins flattened at
// the top level, each referencing its parent by a bare id string. This
// rebuilds the nested authoring shape (services[].routes,
// consumers[].*_credentials, services/routes[].plugins) the rest of the app
// already understands.
export function denormalizeKongConfig(expanded: Record<string, unknown>): KongConfig {
  const rawServices = asArray(expanded.services)
  const rawRoutes = asArray(expanded.routes)
  const rawConsumers = asArray(expanded.consumers)
  const rawPlugins = asArray(expanded.plugins)

  const services: KongService[] = rawServices.map((svc) => stripKeys(svc, []) as KongService)
  const serviceById = new Map<string, KongService>(rawServices.map((svc, i) => [svc.id as string, services[i]]))

  const routes: KongRoute[] = []
  const routeById = new Map<string, KongRoute>()
  for (const raw of rawRoutes) {
    const route = stripKeys(raw, ['service']) as KongRoute
    routeById.set(raw.id as string, route)
    const owner = typeof raw.service === 'string' ? serviceById.get(raw.service) : undefined
    if (owner) {
      owner.routes = [...(owner.routes ?? []), route]
    } else {
      routes.push(route)
    }
  }

  const consumers: KongConsumer[] = rawConsumers.map((c) => stripKeys(c, []) as KongConsumer)
  const consumerById = new Map<string, KongConsumer>(rawConsumers.map((c, i) => [c.id as string, consumers[i]]))

  for (const [key, value] of Object.entries(expanded)) {
    if (!key.endsWith('_credentials') || !Array.isArray(value)) continue
    for (const raw of value as Record<string, unknown>[]) {
      const owner = typeof raw.consumer === 'string' ? consumerById.get(raw.consumer) : undefined
      if (!owner) continue
      const credential = stripKeys(raw, ['consumer'])
      const list = (owner[key] as Record<string, unknown>[] | undefined) ?? []
      owner[key] = [...list, credential]
    }
  }

  const globalPlugins: KongPlugin[] = []
  for (const raw of rawPlugins) {
    const plugin = stripKeys(raw, ['service', 'route', 'consumer']) as KongPlugin
    const routeOwner = typeof raw.route === 'string' ? routeById.get(raw.route) : undefined
    const serviceOwner = typeof raw.service === 'string' ? serviceById.get(raw.service) : undefined
    if (routeOwner) {
      routeOwner.plugins = [...(routeOwner.plugins ?? []), plugin]
    } else if (serviceOwner) {
      const existing = (serviceOwner.plugins as KongPlugin[] | undefined) ?? []
      serviceOwner.plugins = [...existing, plugin]
    } else {
      globalPlugins.push(plugin)
    }
  }

  const denormalized: KongConfig = {
    ...stripKeys(expanded, ['services', 'routes', 'consumers', 'plugins']),
    _format_version: (expanded._format_version as string | undefined) ?? '3.0',
    services,
    consumers,
    plugins: globalPlugins,
  }

  if (routes.length > 0) denormalized.routes = routes

  return denormalized
}
