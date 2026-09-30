import { describe, it, expect } from 'vitest'
import {
  fromEntity,
  newServiceForm,
  serviceProtocolUsesPath,
  serviceProtocolUsesTls,
  toPayload,
  validateService,
} from './serviceForm'

const base = () => ({ ...newServiceForm(), host: 'api.internal' })

describe('newServiceForm', () => {
  it('starts from the Primate defaults', () => {
    expect(newServiceForm()).toMatchObject({
      name: '',
      protocol: 'http',
      host: '',
      port: 80,
      path: '/',
      enabled: true,
      retries: 5,
      tls_verify: 'inherit',
      tls_verify_depth: '',
      client_certificate: '',
      ca_certificates: [],
      tags: [],
    })
  })
})

describe('protocol helpers', () => {
  it('path applies to http, https and tls_passthrough only', () => {
    expect(['http', 'https', 'tls_passthrough'].every(serviceProtocolUsesPath)).toBe(true)
    expect(['grpc', 'grpcs', 'tcp', 'udp', 'tls'].some(serviceProtocolUsesPath)).toBe(false)
  })

  it('TLS verification fields apply to https only', () => {
    expect(serviceProtocolUsesTls('https')).toBe(true)
    expect(['http', 'grpc', 'grpcs', 'tcp', 'udp', 'tls', 'tls_passthrough'].some(serviceProtocolUsesTls)).toBe(false)
  })
})

describe('validateService', () => {
  it('accepts a protocol and a host', () => {
    expect(validateService(base())).toEqual([])
  })

  it.each([
    ['empty host', { host: '' }],
    ['whitespace-only host', { host: '   ' }],
    ['empty protocol', { protocol: '' }],
  ])('rejects %s with the Primate message', (_label, patch) => {
    expect(validateService({ ...base(), ...patch })).toEqual(['Please provide a valid protocol and host combination.'])
  })
})

describe('toPayload', () => {
  it('trims strings and omits an empty name', () => {
    const padded = toPayload({ ...base(), name: '  billing  ', host: '  api.internal ' }, 'update')
    expect(padded.name).toBe('billing')
    expect(padded.host).toBe('api.internal')

    const unnamed = toPayload({ ...base(), name: '   ' }, 'update')
    expect(unnamed).not.toHaveProperty('name')
  })

  it('on update clears TLS fields for http so a PATCH removes them', () => {
    expect(toPayload(base(), 'update')).toMatchObject({
      protocol: 'http',
      host: 'api.internal',
      port: 80,
      path: '/',
      client_certificate: null,
      ca_certificates: null,
      tls_verify: null,
      tls_verify_depth: null,
    })
  })

  it('maps https TLS fields: certificate id object, cleaned ca list, tri-state verify, depth', () => {
    const payload = toPayload(
      {
        ...base(),
        protocol: 'https',
        client_certificate: ' c1 ',
        ca_certificates: ['x', ' '],
        tls_verify: 'false',
        tls_verify_depth: 3,
      },
      'update',
    )
    expect(payload).toMatchObject({
      client_certificate: { id: 'c1' },
      ca_certificates: ['x'],
      tls_verify: false,
      tls_verify_depth: 3,
    })
    expect(toPayload({ ...base(), protocol: 'https', tls_verify: 'true' }, 'update').tls_verify).toBe(true)
  })

  it('https with nothing set clears certificate, ca list, verify and depth', () => {
    expect(toPayload({ ...base(), protocol: 'https' }, 'update')).toMatchObject({
      client_certificate: null,
      ca_certificates: null,
      tls_verify: null,
      tls_verify_depth: null,
    })
  })

  it('clears path for protocols that do not use it, and keeps it for tls_passthrough', () => {
    expect(toPayload({ ...base(), protocol: 'grpc' }, 'update').path).toBeNull()
    expect(toPayload({ ...base(), protocol: 'tcp' }, 'update').path).toBeNull()
    expect(toPayload({ ...base(), protocol: 'tls_passthrough' }, 'update').path).toBe('/')
  })

  it('an empty or whitespace path on http becomes null on update', () => {
    expect(toPayload({ ...base(), path: '  ' }, 'update').path).toBeNull()
  })

  it('create never sends null values', () => {
    const payload = toPayload(base(), 'create')
    expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
    expect(payload).toMatchObject({ protocol: 'http', host: 'api.internal' })
    expect(payload).not.toHaveProperty('client_certificate')
  })

  it('omits empty numeric fields instead of sending empty strings', () => {
    const payload = toPayload({ ...base(), port: '', retries: '' }, 'update')
    expect(payload).not.toHaveProperty('port')
    expect(payload).not.toHaveProperty('retries')
  })

  it('trims tags and drops blank ones', () => {
    expect(toPayload({ ...base(), tags: [' a ', '', '  '] }, 'update').tags).toEqual(['a'])
  })
})

describe('fromEntity', () => {
  it('maps a Kong https service into the form', () => {
    const form = fromEntity({
      id: 's1',
      name: 'a',
      protocol: 'https',
      host: 'h',
      port: 443,
      client_certificate: { id: 'c1' },
      tls_verify: false,
      tls_verify_depth: null,
      ca_certificates: ['x'],
      tags: ['t'],
    })
    expect(form).toMatchObject({
      name: 'a',
      protocol: 'https',
      host: 'h',
      port: 443,
      client_certificate: 'c1',
      tls_verify: 'false',
      tls_verify_depth: '',
      ca_certificates: ['x'],
      tags: ['t'],
    })
  })

  it('round-trips an https service back to the same TLS payload', () => {
    const payload = toPayload(
      fromEntity({
        protocol: 'https',
        host: 'h',
        client_certificate: { id: 'c1' },
        tls_verify: false,
        tls_verify_depth: null,
        ca_certificates: ['x'],
      }),
      'update',
    )
    expect(payload).toMatchObject({
      client_certificate: { id: 'c1' },
      tls_verify: false,
      tls_verify_depth: null,
      ca_certificates: ['x'],
    })
  })

  it('tolerates missing fields, defaulting the protocol to http and enabled to true', () => {
    const form = fromEntity({ host: 'h' })
    expect(form.protocol).toBe('http')
    expect(form.enabled).toBe(true)
    expect(form.port).toBe('')
    expect(form.tls_verify).toBe('inherit')
  })
})
