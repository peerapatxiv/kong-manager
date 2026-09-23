import type { KongConfig, KongPlugin, KongRoute, KongService, KongConsumer } from '../types/kong'

export type DiffChange = { path: string; before: unknown; after: unknown }

export type EntityDiff<T> = {
  added: T[]
  removed: T[]
  changed: { key: string; before: T; after: T; changes: DiffChange[] }[]
  unmatchedA: T[]
  unmatchedB: T[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => keysB.includes(k) && deepEqual(a[k], b[k]))
  }
  return false
}

export function diffLeaves(a: unknown, b: unknown, path = ''): DiffChange[] {
  if (deepEqual(a, b)) return []

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    const changes: DiffChange[] = []
    for (const key of keys) {
      changes.push(...diffLeaves(a[key], b[key], path ? `${path}.${key}` : key))
    }
    return changes
  }

  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    const changes: DiffChange[] = []
    a.forEach((item, i) => {
      changes.push(...diffLeaves(item, b[i], `${path}[${i}]`))
    })
    return changes
  }

  return [{ path, before: a, after: b }]
}

export function diffEntities<T extends Record<string, unknown>>(
  listA: T[] | undefined,
  listB: T[] | undefined,
  naturalKeyField: string,
): EntityDiff<T> {
  const a = listA ?? []
  const b = listB ?? []

  const mapA = new Map<string, T>()
  const unmatchedA: T[] = []
  for (const entity of a) {
    const key = entity[naturalKeyField]
    if (typeof key === 'string' && key.length > 0) mapA.set(key, entity)
    else unmatchedA.push(entity)
  }

  const mapB = new Map<string, T>()
  const unmatchedB: T[] = []
  for (const entity of b) {
    const key = entity[naturalKeyField]
    if (typeof key === 'string' && key.length > 0) mapB.set(key, entity)
    else unmatchedB.push(entity)
  }

  const added: T[] = []
  const changed: EntityDiff<T>['changed'] = []
  for (const [key, entityB] of mapB) {
    const entityA = mapA.get(key)
    if (!entityA) {
      added.push(entityB)
      continue
    }
    const changes = diffLeaves(entityA, entityB)
    if (changes.length > 0) changed.push({ key, before: entityA, after: entityB, changes })
  }

  const removed: T[] = []
  for (const [key, entityA] of mapA) {
    if (!mapB.has(key)) removed.push(entityA)
  }

  return { added, removed, changed, unmatchedA, unmatchedB }
}

export type KongConfigDiff = {
  services: EntityDiff<KongService>
  consumers: EntityDiff<KongConsumer>
  globalPlugins: EntityDiff<KongPlugin>
  routesByService: Map<string, EntityDiff<KongRoute>>
}

function withoutKey<T extends Record<string, unknown>>(entity: T, key: string): T {
  const clone = { ...entity }
  delete clone[key]
  return clone
}

export function diffKongConfigs(a: KongConfig, b: KongConfig): KongConfigDiff {
  // Routes are matched and diffed separately (below, per service), so they're
  // excluded here to avoid double-reporting a route-only change as a service-level
  // "changed" entry too.
  const servicesWithoutRoutes = (services: KongService[] | undefined) =>
    (services ?? []).map((s) => withoutKey(s, 'routes'))

  const services = diffEntities(servicesWithoutRoutes(a.services), servicesWithoutRoutes(b.services), 'name')
  const consumers = diffEntities(a.consumers, b.consumers, 'username')
  const globalPlugins = diffEntities(a.plugins, b.plugins, 'name')

  const servicesA = new Map((a.services ?? []).map((s) => [s.name, s]))
  const servicesB = new Map((b.services ?? []).map((s) => [s.name, s]))
  const allServiceNames = new Set([...servicesA.keys(), ...servicesB.keys()])

  const routesByService = new Map<string, EntityDiff<KongRoute>>()
  for (const name of allServiceNames) {
    if (typeof name !== 'string') continue
    const svcA = servicesA.get(name)
    const svcB = servicesB.get(name)
    routesByService.set(name, diffEntities(svcA?.routes, svcB?.routes, 'name'))
  }

  return { services, consumers, globalPlugins, routesByService }
}
