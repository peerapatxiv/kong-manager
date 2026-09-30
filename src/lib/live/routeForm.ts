import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type RouteForm = {
  name: string
  protocols: string[]
  methods: string[]
  hosts: string[]
  paths: string[]
  /** One `Name: value1, value2` line per header. */
  headers: string[]
  snis: string[]
  /** `ip`, `ip:port`, `[ipv6]` or `[ipv6]:port`, one per entry. */
  sources: string[]
  destinations: string[]
  https_redirect_status_code: number | ''
  regex_priority: number | ''
  strip_path: boolean
  path_handling: string
  preserve_host: boolean
  request_buffering: boolean
  response_buffering: boolean
  tags: string[]
  service: string
}

export const ROUTE_PROTOCOLS = ['http', 'https', 'grpc', 'grpcs', 'tcp', 'tls', 'tls_passthrough', 'udp'] as const

export type RouteFamily = 'http' | 'grpc' | 'stream'

type ListField = 'methods' | 'hosts' | 'headers' | 'paths' | 'snis' | 'sources' | 'destinations'

// Primate's PROTOCOL_CONFIG: at least one of these groups must be filled per protocol.
const REQUIRED_FIELDS: Record<string, ListField[]> = {
  http: ['methods', 'hosts', 'headers', 'paths'],
  https: ['methods', 'hosts', 'headers', 'paths', 'snis'],
  tcp: ['sources', 'destinations'],
  udp: ['sources', 'destinations'],
  tls: ['sources', 'destinations', 'snis'],
  tls_passthrough: ['snis'],
  grpc: ['hosts', 'headers', 'paths'],
  grpcs: ['hosts', 'headers', 'paths', 'snis'],
}

// Fields a protocol can exclude, so they are sent as null when every selected protocol excludes them.
const EXCLUSIVE_FIELDS: ListField[] = ['methods', 'hosts', 'headers', 'paths', 'sources', 'destinations']

const MIXED_FAMILIES_MESSAGE =
  'Choose protocols from one family: HTTP/HTTPS, GRPC/GRPCS, or TCP/TLS/TLS passthrough/UDP.'

function familyOf(protocol: string): string {
  if (protocol === 'http' || protocol === 'https') return 'http'
  if (protocol === 'grpc' || protocol === 'grpcs') return 'grpc'
  if (['tcp', 'tls', 'tls_passthrough', 'udp'].includes(protocol)) return 'stream'
  return protocol
}

export function routeFamily(protocols: string[]): RouteFamily | null {
  const families = new Set(protocols.map(familyOf))
  if (families.size !== 1) return null
  const [family] = [...families]
  return family === 'http' || family === 'grpc' || family === 'stream' ? family : null
}

export function parseAddress(entry: string): { ip: string; port?: number } | null {
  const value = entry.trim()
  if (!value) return null

  let ip: string
  let portText: string | undefined
  const bracketed = /^\[([^\]]*)\](?::(.*))?$/.exec(value)
  if (bracketed) {
    ip = bracketed[1]
    portText = bracketed[2]
  } else {
    const parts = value.split(':')
    if (parts.length > 2) return null
    ip = parts[0]
    portText = parts[1]
  }

  ip = ip.trim()
  if (!ip) return null
  if (portText === undefined) return { ip }
  if (!/^\d+$/.test(portText)) return null
  const port = Number(portText)
  if (port < 1 || port > 65535) return null
  return { ip, port }
}

export function parseHeaderLine(line: string): { name: string; values: string[] } | null {
  const colon = line.indexOf(':')
  if (colon < 1) return null
  const name = line.slice(0, colon).trim()
  const values = line
    .slice(colon + 1)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!name || values.length === 0) return null
  return { name, values }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberOrEmpty = (value: unknown): number | '' => (typeof value === 'number' ? value : '')
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

function addressesFromEntity(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const { ip, port } = (item ?? {}) as { ip?: unknown; port?: unknown }
    if (typeof ip !== 'string' || !ip) return []
    const host = ip.includes(':') ? `[${ip}]` : ip
    return [typeof port === 'number' ? `${host}:${port}` : host]
  })
}

function headersFromEntity(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).map(
    ([name, values]) => `${name}: ${stringList(values).join(', ')}`,
  )
}

export function fromEntity(entity: Record<string, unknown>): RouteForm {
  const service = entity.service as { id?: unknown } | null | undefined
  return {
    name: text(entity.name),
    protocols: stringList(entity.protocols),
    methods: stringList(entity.methods),
    hosts: stringList(entity.hosts),
    paths: stringList(entity.paths),
    headers: headersFromEntity(entity.headers),
    snis: stringList(entity.snis),
    sources: addressesFromEntity(entity.sources),
    destinations: addressesFromEntity(entity.destinations),
    https_redirect_status_code: numberOrEmpty(entity.https_redirect_status_code),
    regex_priority: numberOrEmpty(entity.regex_priority),
    strip_path: flag(entity.strip_path, true),
    path_handling: text(entity.path_handling) || 'v0',
    preserve_host: flag(entity.preserve_host, false),
    request_buffering: flag(entity.request_buffering, true),
    response_buffering: flag(entity.response_buffering, true),
    tags: stringList(entity.tags),
    service: typeof service?.id === 'string' ? service.id : '',
  }
}

export function newRouteForm(): RouteForm {
  return fromEntity(ENTITY_RESOURCES.routes.defaults)
}

export function validateRoute(form: RouteForm): string[] {
  if (form.protocols.length === 0) return ['Please check at least one protocol from the list.']
  if (new Set(form.protocols.map(familyOf)).size > 1) return [MIXED_FAMILIES_MESSAGE]

  const errors: string[] = []
  for (const protocol of form.protocols) {
    const required = REQUIRED_FIELDS[protocol]
    if (!required) continue
    if (!required.some((field) => cleanList(form[field]).length > 0)) {
      errors.push(`At least one of ${required.join(', ')} is required, if ${protocol.toUpperCase()} is selected.`)
    }
  }
  for (const field of ['sources', 'destinations'] as const) {
    for (const entry of form[field]) {
      if (entry.trim() && !parseAddress(entry)) {
        errors.push(`Invalid ${field} entry "${entry}": use ip or ip:port (port 1-65535), with IPv6 in brackets.`)
      }
    }
  }
  for (const line of form.headers) {
    if (line.trim() && !parseHeaderLine(line)) {
      errors.push(`Header "${line}" must look like "Name: value1, value2".`)
    }
  }
  return errors
}

export function toPayload(form: RouteForm, mode: 'create' | 'update'): Record<string, unknown> {
  const headerMap: Record<string, string[]> = {}
  for (const line of form.headers) {
    const header = parseHeaderLine(line)
    if (header) headerMap[header.name] = header.values
  }
  const addresses = (entries: string[]) =>
    entries.flatMap((entry) => {
      const address = parseAddress(entry)
      return address ? [address] : []
    })
  const service = form.service.trim()

  const payload: Record<string, unknown> = {
    protocols: form.protocols,
    methods: cleanList(form.methods),
    hosts: cleanList(form.hosts),
    paths: cleanList(form.paths),
    headers: Object.keys(headerMap).length > 0 ? headerMap : null,
    snis: cleanList(form.snis),
    sources: addresses(form.sources),
    destinations: addresses(form.destinations),
    strip_path: form.strip_path,
    path_handling: form.path_handling,
    preserve_host: form.preserve_host,
    request_buffering: form.request_buffering,
    response_buffering: form.response_buffering,
    tags: cleanList(form.tags),
    service: service ? { id: service } : null,
  }

  const name = form.name.trim()
  if (name) payload.name = name
  if (form.https_redirect_status_code !== '') payload.https_redirect_status_code = form.https_redirect_status_code
  if (form.regex_priority !== '') payload.regex_priority = form.regex_priority

  if (form.protocols.length > 0) {
    for (const field of EXCLUSIVE_FIELDS) {
      if (form.protocols.every((protocol) => !REQUIRED_FIELDS[protocol]?.includes(field))) payload[field] = null
    }
    if (form.protocols.every((protocol) => protocol === 'grpc' || protocol === 'grpcs')) delete payload.strip_path
  }

  if (mode === 'create') {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined))
  }
  return payload
}
