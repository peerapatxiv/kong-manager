import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type UpstreamForm = {
  name: string
  algorithm: string
  hash_on: string
  hash_fallback: string
  slots: number | ''
  host_header: string
  tags: string[]
}

export const UPSTREAM_ALGORITHMS = ['round-robin', 'consistent-hashing', 'least-connections', 'latency'] as const

// Only the hash sources that need no extra field (header name, cookie, query arg) are offered.
const HASH_SOURCES = ['none', 'consumer', 'ip']

/** The hash sources to offer, plus the current one if it is not among them, so editing never rewrites it. */
export function hashOptions(current: string): string[] {
  return HASH_SOURCES.includes(current) || current === '' ? [...HASH_SOURCES] : [...HASH_SOURCES, current]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberOrEmpty = (value: unknown): number | '' => (typeof value === 'number' ? value : '')
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export function fromEntity(entity: Record<string, unknown>): UpstreamForm {
  return {
    name: text(entity.name),
    algorithm: text(entity.algorithm) || 'round-robin',
    hash_on: text(entity.hash_on) || 'none',
    hash_fallback: text(entity.hash_fallback) || 'none',
    slots: numberOrEmpty(entity.slots),
    host_header: text(entity.host_header),
    tags: stringList(entity.tags),
  }
}

export function newUpstreamForm(): UpstreamForm {
  return fromEntity(ENTITY_RESOURCES.upstreams.defaults)
}

export function validateUpstream(form: UpstreamForm): string[] {
  const errors: string[] = []
  if (form.name.trim() === '') errors.push('Please provide a name for the upstream.')
  if (form.slots !== '' && (!Number.isInteger(form.slots) || form.slots < 10 || form.slots > 65536)) {
    errors.push('Slots must be a whole number from 10 to 65536.')
  }
  return errors
}

/** `healthchecks` is never sent: Kong applies its defaults on create and a PATCH leaves it as it is. */
export function toPayload(form: UpstreamForm, mode: 'create' | 'update'): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    algorithm: form.algorithm,
    hash_on: form.hash_on,
    hash_fallback: form.hash_fallback,
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
  }
  if (form.slots !== '') payload.slots = form.slots
  const hostHeader = form.host_header.trim()
  if (hostHeader) payload.host_header = hostHeader
  else if (mode === 'update') payload.host_header = null
  return payload
}
