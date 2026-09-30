import { adminFetch, adminJson } from './http'
import type { KongAdminConnection } from './http'

export type EntityResourceName =
  | 'services'
  | 'routes'
  | 'service_routes'
  | 'upstreams'
  | 'targets'
  | 'consumers'
  | 'plugins'
  | 'certificates'
  | 'ca_certificates'
  | 'snis'

export type EntityResourceConfig = {
  path: string
  nested: boolean
  defaults: Record<string, unknown>
}

function routeDefaults(): Record<string, unknown> {
  return {
    name: '',
    protocols: [],
    methods: [],
    hosts: [],
    paths: [],
    headers: {},
    https_redirect_status_code: 426,
    regex_priority: 0,
    strip_path: true,
    path_handling: 'v0',
    preserve_host: false,
    request_buffering: true,
    response_buffering: true,
    snis: [],
    sources: [],
    destinations: [],
    tags: [],
  }
}

// Defaults are ported from Primate's models. Its '__none__' sentinels for unset
// references are dropped: an unset reference is simply an omitted key.
export const ENTITY_RESOURCES: Record<EntityResourceName, EntityResourceConfig> = {
  services: {
    path: 'services',
    nested: false,
    defaults: {
      name: '',
      enabled: true,
      retries: 5,
      protocol: 'http',
      host: '',
      port: 80,
      path: '/',
      connect_timeout: 60000,
      write_timeout: 60000,
      read_timeout: 60000,
      ca_certificates: [],
      tags: [],
    },
  },
  routes: {
    path: 'routes',
    nested: false,
    defaults: routeDefaults(),
  },
  service_routes: {
    path: 'services/:parentId/routes',
    nested: true,
    defaults: routeDefaults(),
  },
  upstreams: {
    path: 'upstreams',
    nested: false,
    defaults: {
      name: '',
      algorithm: 'round-robin',
      hash_on: 'none',
      hash_on_value: '',
      hash_fallback: 'none',
      hash_fallback_value: '',
      slots: 10000,
      healthchecks: {
        passive: {
          type: 'http',
          healthy: { successes: 0, http_statuses: [] },
          unhealthy: { tcp_failures: 0, http_statuses: [], http_failures: 0, timeouts: 0 },
        },
        active: {
          http_path: '/',
          timeout: 1,
          concurrency: 10,
          https_sni: '',
          type: 'http',
          headers: {},
          healthy: { interval: 0, http_statuses: [], successes: 0 },
          https_verify_certificate: true,
          unhealthy: { tcp_failures: 0, http_statuses: [], http_failures: 0, interval: 0, timeouts: 0 },
        },
        threshold: 0,
      },
      tags: [],
      host_header: '',
    },
  },
  targets: {
    path: 'upstreams/:parentId/targets',
    nested: true,
    defaults: { target: '', weight: 100, tags: [] },
  },
  consumers: {
    path: 'consumers',
    nested: false,
    defaults: { username: '', custom_id: '', tags: [] },
  },
  plugins: {
    path: 'plugins',
    nested: false,
    defaults: { name: '', config: {}, protocols: ['http', 'https', 'grpc', 'grpcs'], enabled: true, tags: [] },
  },
  certificates: {
    path: 'certificates',
    nested: false,
    defaults: { cert: '', key: '', cert_alt: '', key_alt: '', tags: [], snis: [] },
  },
  ca_certificates: {
    path: 'ca_certificates',
    nested: false,
    defaults: { cert: '', cert_digest: '', tags: [] },
  },
  snis: {
    path: 'snis',
    nested: false,
    defaults: { name: '', tags: [] },
  },
}

export type ListOptions = { size?: number; offset?: string; tags?: string[] }
export type ListPage<T> = { data: T[]; next: string | null }

export type EntityClient<T> = {
  list(opts?: ListOptions): Promise<ListPage<T>>
  listAll(opts?: Omit<ListOptions, 'offset'>): Promise<T[]>
  get(idOrName: string): Promise<T>
  create(body: Partial<T>): Promise<T>
  update(idOrName: string, patch: Partial<T>): Promise<T>
  upsert(idOrName: string, body: Partial<T>): Promise<T>
  remove(idOrName: string): Promise<void>
}

export class ReadOnlyError extends Error {
  constructor() {
    super('Kong is running without a database (DB-less), so entities are read-only.')
    this.name = 'ReadOnlyError'
  }
}

export function createEntityClient<T = Record<string, unknown>>(
  conn: KongAdminConnection,
  resource: EntityResourceName,
  parentId?: string,
): EntityClient<T> {
  const config = ENTITY_RESOURCES[resource]
  if (config.nested && !parentId) {
    throw new Error(`The "${resource}" resource is nested and needs a parentId`)
  }
  const base = `/${config.path.replace(':parentId', encodeURIComponent(parentId ?? ''))}`
  const itemPath = (idOrName: string) => `${base}/${encodeURIComponent(idOrName)}`

  async function list(opts: ListOptions = {}): Promise<ListPage<T>> {
    const body = await adminJson<{ data?: T[]; offset?: string | null }>(conn, 'GET', base, {
      query: {
        size: opts.size,
        offset: opts.offset,
        tags: opts.tags && opts.tags.length > 0 ? opts.tags.join(',') : undefined,
      },
    })
    return { data: body.data ?? [], next: body.offset ?? null }
  }

  async function listAll(opts: Omit<ListOptions, 'offset'> = {}): Promise<T[]> {
    const all: T[] = []
    let offset: string | undefined
    do {
      const page = await list({ ...opts, offset })
      all.push(...page.data)
      offset = page.next ?? undefined
    } while (offset)
    return all
  }

  return {
    list,
    listAll,
    get: (idOrName) => adminJson<T>(conn, 'GET', itemPath(idOrName)),
    create: (body) => adminJson<T>(conn, 'POST', base, { body }),
    update: (idOrName, patch) => adminJson<T>(conn, 'PATCH', itemPath(idOrName), { body: patch }),
    upsert: (idOrName, body) => adminJson<T>(conn, 'PUT', itemPath(idOrName), { body }),
    remove: async (idOrName) => {
      await adminFetch(conn, 'DELETE', itemPath(idOrName))
    },
  }
}

export function guardWrites<T>(client: EntityClient<T>, canWrite: () => boolean): EntityClient<T> {
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      canWrite() ? fn(...args) : Promise.reject(new ReadOnlyError())

  return {
    ...client,
    create: guard(client.create),
    update: guard(client.update),
    upsert: guard(client.upsert),
    remove: guard(client.remove),
  }
}
