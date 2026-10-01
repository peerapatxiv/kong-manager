import { describe, it, expect, afterEach, vi } from 'vitest'
import { describeConnectError } from './connectError'
import { KongAdminApiError } from './kongAdmin/http'

const base = 'https://kong.internal:8444'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('describeConnectError', () => {
  it('explains a network failure: address, Kong running, CORS, and the https-to-http rule', () => {
    const message = describeConnectError(new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' }), base)

    expect(message).toContain(`Could not reach ${base}`)
    expect(message).toContain('CORS')
    expect(message).toMatch(/https.*http/i)
    expect(message).toContain('Failed to fetch')
  })

  it('says why a website cannot always reach a Kong with a login: the browser asks permission first', () => {
    const message = describeConnectError(new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' }), base)

    expect(message).toMatch(/preflight/i)
    expect(message).toMatch(/without (a )?(login|credentials)/i)
  })

  it('points to the local copy as the way around it, with the address to open', () => {
    const message = describeConnectError(new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' }), base)

    expect(message).toContain('npm start')
    expect(message).toContain('http://localhost:4173/kong-manager/')
  })

  it('mentions the https-to-http rule only when an https page is asked to call a plain http address', () => {
    const error = new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' })

    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    expect(describeConnectError(error, 'http://kong.internal:8001')).toContain('plain http')
    expect(describeConnectError(error, 'https://kong.internal:8444')).not.toContain('plain http')

    vi.stubGlobal('window', { location: { protocol: 'http:' } })
    expect(describeConnectError(error, 'http://kong.internal:8001')).not.toContain('plain http')
  })

  it('does not call a localhost address blocked by the https rule, since browsers allow it', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    const error = new KongAdminApiError('Failed to fetch', { status: 0, kind: 'network' })
    expect(describeConnectError(error, 'http://localhost:8001')).not.toContain('plain http')
    expect(describeConnectError(error, 'http://127.0.0.1:8001')).not.toContain('plain http')
  })

  it('reports rejected credentials with the status', () => {
    const message = describeConnectError(new KongAdminApiError('x', { status: 401, kind: 'auth' }), base)

    expect(message).toContain('rejected the credentials')
    expect(message).toContain('401')
  })

  it('explains that /config only exists on DB-less Kong when it answers 404', () => {
    const message = describeConnectError(new KongAdminApiError('x', { status: 404, kind: 'notFound' }), base)

    expect(message).toContain('/config')
    expect(message).toMatch(/DB-less|without a database/i)
  })

  it('falls back to the plain message for other Kong errors, other errors and non-errors', () => {
    expect(describeConnectError(new KongAdminApiError('Kong Admin API responded 500: boom', { status: 500, kind: 'server' }), base)).toBe(
      'Kong Admin API responded 500: boom',
    )
    expect(describeConnectError(new Error('connection refused'), base)).toBe('connection refused')
    expect(describeConnectError('oops', base)).toBe('oops')
  })


  it('in local proxy mode, blames the address or Kong being down, not CORS or https', () => {
    vi.stubEnv('VITE_KONG_PROXY', 'true')

    const message = describeConnectError(
      new KongAdminApiError('Could not reach Kong at https://kong.internal:8444: connect ECONNREFUSED', { status: 0, kind: 'network' }),
      base,
    )

    expect(message).toContain('local proxy')
    expect(message).toContain('ECONNREFUSED')
    expect(message).not.toContain('CORS')
  })
})
