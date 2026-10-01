export type RouteSummary = {
  /** At most two HTTP methods; empty when the route accepts any. */
  methods: string[]
  moreMethods: number
  /** The first path, or the first host for a route that only matches on host. */
  target: string
  moreTargets: number
}

const MAX_METHODS = 2

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** A short, list-friendly description of what a route matches. */
export function summarizeRoute(route: Record<string, unknown>): RouteSummary {
  const methods = strings(route.methods)
  const paths = strings(route.paths)
  const hosts = strings(route.hosts)
  const targets = paths.length > 0 ? paths : hosts
  return {
    methods: methods.slice(0, MAX_METHODS),
    moreMethods: Math.max(0, methods.length - MAX_METHODS),
    target: targets[0] ?? '',
    moreTargets: Math.max(0, targets.length - 1),
  }
}
