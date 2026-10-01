import type { KongConfig, KongConsumer, KongPlugin, KongRoute, KongService } from '../types/kong'
import { countRouteProtocols, summarizeServices, topPlugins } from './live/dashboard'
import type { LabelCount, PluginCount, ServiceSummary } from './live/dashboard'

// Names are not unique in a declarative config (several routes or plugins can share one) and
// they are editable, so entries are identified by where they sit. An id stays the same when
// the entry is renamed, and `replace` swaps the entry in its parent list.

const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const serviceName = (service: KongService): string => service.name ?? service.host
const consumerName = (consumer: KongConsumer): string => consumer.username ?? consumer.custom_id ?? ''

export type RouteEntry = {
  id: string
  label: string
  serviceName: string
  /** The key under which an edit to this route is recorded as modified. */
  modifiedKey: string
  route: KongRoute
  replace: (next: KongRoute) => void
}

function routeLabel(route: KongRoute, index: number): string {
  return route.name ?? route.paths?.[0] ?? `route ${index + 1}`
}

export function listRoutes(config: KongConfig): RouteEntry[] {
  const entries: RouteEntry[] = []
  asList<KongService>(config.services).forEach((service, serviceIndex) => {
    const routes = service.routes
    asList<KongRoute>(routes).forEach((route, routeIndex) => {
      entries.push({
        id: `${serviceIndex}/${routeIndex}`,
        label: routeLabel(route, routeIndex),
        serviceName: serviceName(service),
        modifiedKey: `route:${serviceIndex}/${routeIndex}`,
        route,
        replace: (next) => {
          routes![routeIndex] = next
        },
      })
    })
  })
  return entries
}

export type PluginScope = { kind: 'global' | 'service' | 'route' | 'consumer'; label: string }

export type PluginEntry = {
  id: string
  scope: PluginScope
  modifiedKey: string
  plugin: KongPlugin
  replace: (next: KongPlugin) => void
}

export function listPlugins(config: KongConfig): PluginEntry[] {
  const entries: PluginEntry[] = []
  const add = (list: KongPlugin[], idPrefix: string, scope: PluginScope) => {
    list.forEach((plugin, index) => {
      const id = `${idPrefix}/${index}`
      entries.push({
        id,
        scope,
        modifiedKey: `plugin:${id}`,
        plugin,
        replace: (next) => {
          list[index] = next
        },
      })
    })
  }

  add(asList<KongPlugin>(config.plugins), 'g', { kind: 'global', label: 'global' })

  asList<KongService>(config.services).forEach((service, serviceIndex) => {
    add(asList<KongPlugin>(service.plugins), `s/${serviceIndex}`, { kind: 'service', label: serviceName(service) })
    asList<KongRoute>(service.routes).forEach((route, routeIndex) => {
      add(asList<KongPlugin>(route.plugins), `r/${serviceIndex}/${routeIndex}`, {
        kind: 'route',
        label: routeLabel(route, routeIndex),
      })
    })
  })

  asList<KongConsumer>(config.consumers).forEach((consumer, consumerIndex) => {
    add(asList<KongPlugin>(consumer.plugins), `c/${consumerIndex}`, { kind: 'consumer', label: consumerName(consumer) })
  })

  return entries
}

export type FileSummary = {
  services: number
  routes: number
  consumers: number
  plugins: number
  serviceStatus: ServiceSummary
  protocols: LabelCount[]
  topPlugins: PluginCount[]
}

export function summarizeFile(config: KongConfig): FileSummary {
  const services = asList<KongService>(config.services)
  const routes = listRoutes(config)
  const plugins = listPlugins(config)
  return {
    services: services.length,
    routes: routes.length,
    consumers: asList<KongConsumer>(config.consumers).length,
    plugins: plugins.length,
    serviceStatus: summarizeServices(services),
    protocols: countRouteProtocols(routes.map((entry) => entry.route)),
    topPlugins: topPlugins(plugins.map((entry) => entry.plugin)),
  }
}
