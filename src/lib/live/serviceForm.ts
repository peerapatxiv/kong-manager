import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type ServiceForm = {
  name: string
  protocol: string
  host: string
  port: number | ''
  path: string
  enabled: boolean
  retries: number | ''
  connect_timeout: number | ''
  write_timeout: number | ''
  read_timeout: number | ''
  tags: string[]
  client_certificate: string
  ca_certificates: string[]
  tls_verify: 'inherit' | 'true' | 'false'
  tls_verify_depth: number | ''
}

export const SERVICE_PROTOCOLS = ['http', 'https', 'grpc', 'grpcs', 'tcp', 'udp', 'tls', 'tls_passthrough'] as const

const PATH_PROTOCOLS: readonly string[] = ['http', 'https', 'tls_passthrough']
const NUMERIC_FIELDS = ['port', 'retries', 'connect_timeout', 'write_timeout', 'read_timeout'] as const

export function serviceProtocolUsesPath(protocol: string): boolean {
  return PATH_PROTOCOLS.includes(protocol)
}

export function serviceProtocolUsesTls(protocol: string): boolean {
  return protocol === 'https'
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberOrEmpty = (value: unknown): number | '' => (typeof value === 'number' ? value : '')
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function fromEntity(entity: Record<string, unknown>): ServiceForm {
  const certificate = entity.client_certificate as { id?: unknown } | null | undefined
  return {
    name: text(entity.name),
    protocol: text(entity.protocol) || 'http',
    host: text(entity.host),
    port: numberOrEmpty(entity.port),
    path: text(entity.path),
    enabled: typeof entity.enabled === 'boolean' ? entity.enabled : true,
    retries: numberOrEmpty(entity.retries),
    connect_timeout: numberOrEmpty(entity.connect_timeout),
    write_timeout: numberOrEmpty(entity.write_timeout),
    read_timeout: numberOrEmpty(entity.read_timeout),
    tags: stringList(entity.tags),
    client_certificate: typeof certificate?.id === 'string' ? certificate.id : '',
    ca_certificates: stringList(entity.ca_certificates),
    tls_verify: entity.tls_verify === true ? 'true' : entity.tls_verify === false ? 'false' : 'inherit',
    tls_verify_depth: numberOrEmpty(entity.tls_verify_depth),
  }
}

export function newServiceForm(): ServiceForm {
  return fromEntity(ENTITY_RESOURCES.services.defaults)
}

export function validateService(form: ServiceForm): string[] {
  if (!form.protocol || form.host.trim() === '') {
    return ['Please provide a valid protocol and host combination.']
  }
  return []
}

export function toPayload(form: ServiceForm, mode: 'create' | 'update'): Record<string, unknown> {
  const tls = serviceProtocolUsesTls(form.protocol)
  const certificate = form.client_certificate.trim()
  const caCertificates = cleanList(form.ca_certificates)

  const payload: Record<string, unknown> = {
    protocol: form.protocol,
    host: form.host.trim(),
    enabled: form.enabled,
    tags: cleanList(form.tags),
    path: serviceProtocolUsesPath(form.protocol) ? form.path.trim() || null : null,
    client_certificate: tls && certificate ? { id: certificate } : null,
    ca_certificates: tls && caCertificates.length > 0 ? caCertificates : null,
    tls_verify: tls ? { inherit: null, true: true, false: false }[form.tls_verify] : null,
    tls_verify_depth: tls && form.tls_verify_depth !== '' ? form.tls_verify_depth : null,
  }

  const name = form.name.trim()
  if (name) payload.name = name
  for (const key of NUMERIC_FIELDS) {
    if (form[key] !== '') payload[key] = form[key]
  }

  if (mode === 'create') {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined))
  }
  return payload
}
