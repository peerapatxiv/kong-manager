import { describe, it, expect } from 'vitest'
import {
  fromEntity,
  newRouteForm,
  parseAddress,
  parseHeaderLine,
  routeFamily,
  toPayload,
  validateRoute,
} from './routeForm'

const http = (patch = {}) => ({ ...newRouteForm(), protocols: ['http'], paths: ['/a'], ...patch })

describe('newRouteForm', () => {
  it('starts from the Primate defaults', () => {
    expect(newRouteForm()).toMatchObject({
      name: '',
      protocols: [],
      https_redirect_status_code: 426,
      regex_priority: 0,
      strip_path: true,
      path_handling: 'v0',
      preserve_host: false,
      request_buffering: true,
      response_buffering: true,
      service: '',
      headers: [],
    })
  })
})

describe('routeFamily', () => {
  it('maps protocol selections to one family, or null when empty or mixed', () => {
    expect(routeFamily(['http', 'https'])).toBe('http')
    expect(routeFamily(['grpc'])).toBe('grpc')
    expect(routeFamily(['tcp', 'tls', 'tls_passthrough', 'udp'])).toBe('stream')
    expect(routeFamily([])).toBeNull()
    expect(routeFamily(['http', 'tcp'])).toBeNull()
  })
})

describe('parseAddress', () => {
  it.each([
    ['10.0.0.1', { ip: '10.0.0.1' }],
    ['10.0.0.1:80', { ip: '10.0.0.1', port: 80 }],
    ['10.0.0.1:65535', { ip: '10.0.0.1', port: 65535 }],
    ['10.0.0.0/8', { ip: '10.0.0.0/8' }],
    ['[::1]', { ip: '::1' }],
    ['[::1]:80', { ip: '::1', port: 80 }],
    ['  10.0.0.1:1  ', { ip: '10.0.0.1', port: 1 }],
  ])('accepts %s', (entry, expected) => {
    expect(parseAddress(entry)).toEqual(expected)
  })

  it.each(['', '   ', '10.0.0.1:', '10.0.0.1:0', '10.0.0.1:65536', '10.0.0.1:abc', '::1', ':80', '[::1]:', '[]'])(
    'rejects %j',
    (entry) => {
      expect(parseAddress(entry)).toBeNull()
    },
  )
})

describe('parseHeaderLine', () => {
  it('parses "Name: v1, v2" into a name and trimmed values', () => {
    expect(parseHeaderLine('X-Env: dev,  prod ')).toEqual({ name: 'X-Env', values: ['dev', 'prod'] })
  })

  it.each(['novalue', 'X: ', ': v', '  ', 'X: , ,'])('rejects %j', (line) => {
    expect(parseHeaderLine(line)).toBeNull()
  })
})

describe('validateRoute', () => {
  it('accepts an http route with a path', () => {
    expect(validateRoute(http())).toEqual([])
  })

  it('requires at least one protocol', () => {
    expect(validateRoute(newRouteForm())).toEqual(['Please check at least one protocol from the list.'])
  })

  it('rejects mixing protocol families and reports only that', () => {
    expect(validateRoute(http({ protocols: ['http', 'tcp'] }))).toEqual([
      'Choose protocols from one family: HTTP/HTTPS, GRPC/GRPCS, or TCP/TLS/TLS passthrough/UDP.',
    ])
  })

  it('requires one of the protocol\'s field groups', () => {
    expect(validateRoute(http({ paths: [] }))).toEqual([
      'At least one of methods, hosts, headers, paths is required, if HTTP is selected.',
    ])
    expect(validateRoute({ ...newRouteForm(), protocols: ['tcp'] })).toEqual([
      'At least one of sources, destinations is required, if TCP is selected.',
    ])
    expect(validateRoute({ ...newRouteForm(), protocols: ['tls_passthrough'] })).toEqual([
      'At least one of snis is required, if TLS_PASSTHROUGH is selected.',
    ])
    expect(validateRoute({ ...newRouteForm(), protocols: ['grpc'], methods: ['GET'] })).toEqual([
      'At least one of hosts, headers, paths is required, if GRPC is selected.',
    ])
  })

  it('treats whitespace-only entries as empty', () => {
    expect(validateRoute(http({ paths: ['  '] }))).toHaveLength(1)
  })

  it('flags malformed sources and destinations', () => {
    const errors = validateRoute({
      ...newRouteForm(),
      protocols: ['tcp'],
      sources: ['10.0.0.1:0', '10.0.0.2:80'],
      destinations: ['::1'],
    })
    expect(errors).toEqual([
      'Invalid sources entry "10.0.0.1:0": use ip or ip:port (port 1-65535), with IPv6 in brackets.',
      'Invalid destinations entry "::1": use ip or ip:port (port 1-65535), with IPv6 in brackets.',
    ])
  })

  it('flags malformed header lines', () => {
    expect(validateRoute(http({ headers: ['x-a: 1', 'broken'] }))).toEqual([
      'Header "broken" must look like "Name: value1, value2".',
    ])
  })
})

describe('toPayload', () => {
  it('trims list entries and keeps fields the http family uses', () => {
    const payload = toPayload(http({ hosts: [' a.com ', ''] }), 'update')
    expect(payload).toMatchObject({
      protocols: ['http'],
      paths: ['/a'],
      hosts: ['a.com'],
      methods: [],
      snis: [],
      headers: null,
      sources: null,
      destinations: null,
      strip_path: true,
      service: null,
      https_redirect_status_code: 426,
      regex_priority: 0,
    })
  })

  it('omits an empty name and trims a padded one', () => {
    expect(toPayload(http(), 'update')).not.toHaveProperty('name')
    expect(toPayload(http({ name: '  r1 ' }), 'update').name).toBe('r1')
  })

  it('clears http-family fields for tcp and parses addresses', () => {
    const payload = toPayload(
      { ...newRouteForm(), protocols: ['tcp'], sources: ['10.0.0.1:80', '[::1]'] },
      'update',
    )
    expect(payload).toMatchObject({
      sources: [{ ip: '10.0.0.1', port: 80 }, { ip: '::1' }],
      destinations: [],
      hosts: null,
      paths: null,
      methods: null,
      headers: null,
      snis: [],
    })
  })

  it('clears everything but snis for tls_passthrough', () => {
    expect(
      toPayload({ ...newRouteForm(), protocols: ['tls_passthrough'], snis: ['a.com'] }, 'update'),
    ).toMatchObject({
      snis: ['a.com'],
      sources: null,
      destinations: null,
      hosts: null,
      paths: null,
      methods: null,
      headers: null,
    })
  })

  it('clears methods for grpc and drops strip_path for grpc-only selections', () => {
    const grpc = toPayload({ ...newRouteForm(), protocols: ['grpc'], hosts: ['g.com'] }, 'update')
    expect(grpc.methods).toBeNull()
    expect(grpc.hosts).toEqual(['g.com'])
    expect(grpc).not.toHaveProperty('strip_path')
    expect(toPayload(http({ protocols: ['http', 'https'] }), 'update')).toHaveProperty('strip_path', true)
  })

  it('turns header lines into a name to values map, or null when there are none', () => {
    expect(toPayload(http({ headers: ['X-Env: dev, prod', 'x-a: 1'] }), 'update').headers).toEqual({
      'X-Env': ['dev', 'prod'],
      'x-a': ['1'],
    })
    expect(toPayload(http({ headers: [] }), 'update').headers).toBeNull()
  })

  it('sends the service as { id } or null', () => {
    expect(toPayload(http({ service: ' svc-1 ' }), 'update').service).toEqual({ id: 'svc-1' })
    expect(toPayload(http({ service: '' }), 'update').service).toBeNull()
  })

  it('omits empty numeric fields', () => {
    const payload = toPayload(http({ https_redirect_status_code: '', regex_priority: '' }), 'update')
    expect(payload).not.toHaveProperty('https_redirect_status_code')
    expect(payload).not.toHaveProperty('regex_priority')
  })

  it('create never sends null values', () => {
    const payload = toPayload(http(), 'create')
    expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
    expect(payload).not.toHaveProperty('sources')
    expect(payload).not.toHaveProperty('headers')
    expect(payload).not.toHaveProperty('service')
    expect(payload).toMatchObject({ protocols: ['http'], paths: ['/a'] })
  })

  it('on update, removing the last host sends an empty list so the server clears it', () => {
    expect(toPayload(http({ hosts: [] }), 'update').hosts).toEqual([])
  })
})

describe('fromEntity', () => {
  const entity = {
    name: 'r',
    protocols: ['https'],
    hosts: ['a'],
    paths: ['/p'],
    methods: ['GET'],
    headers: { 'x-env': ['dev', 'prod'] },
    snis: ['s'],
    sources: [{ ip: '1.1.1.1', port: 80 }, { ip: '::1' }],
    destinations: [],
    https_redirect_status_code: 301,
    regex_priority: 5,
    strip_path: false,
    path_handling: 'v1',
    preserve_host: true,
    request_buffering: false,
    response_buffering: false,
    tags: ['t'],
    service: { id: 'svc-1' },
  }

  it('maps a Kong route into the form', () => {
    expect(fromEntity(entity)).toMatchObject({
      name: 'r',
      protocols: ['https'],
      hosts: ['a'],
      paths: ['/p'],
      methods: ['GET'],
      headers: ['x-env: dev, prod'],
      snis: ['s'],
      sources: ['1.1.1.1:80', '[::1]'],
      destinations: [],
      https_redirect_status_code: 301,
      regex_priority: 5,
      strip_path: false,
      path_handling: 'v1',
      preserve_host: true,
      request_buffering: false,
      response_buffering: false,
      tags: ['t'],
      service: 'svc-1',
    })
  })

  it('round-trips headers and the service back to the Kong shapes', () => {
    const payload = toPayload(fromEntity(entity), 'update')
    expect(payload.headers).toEqual({ 'x-env': ['dev', 'prod'] })
    expect(payload.service).toEqual({ id: 'svc-1' })
  })

  it('round-trips addresses back to the Kong shapes for a stream route', () => {
    const payload = toPayload(fromEntity({ ...entity, protocols: ['tcp'] }), 'update')
    expect(payload.sources).toEqual([{ ip: '1.1.1.1', port: 80 }, { ip: '::1' }])
  })

  it('tolerates null and missing fields', () => {
    const form = fromEntity({ sources: null, headers: null, service: null, hosts: null })
    expect(form.sources).toEqual([])
    expect(form.headers).toEqual([])
    expect(form.hosts).toEqual([])
    expect(form.service).toBe('')
  })
})
